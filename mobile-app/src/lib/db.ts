import initSqlJs, { Database } from "sql.js";
import sqlWasmUrl from "../assets/sql-wasm.wasm?url";
import type { Customer, Product, ProductUnit, Transaction, TransactionItem } from "../types";
import { hashPassword } from "./auth";
import { normalizeProductUnit, resolveProductUnit } from "./units";

let db: Database | null = null;

const DB_KEY = "magazin-proekt-db";
const SEED_VERSION_KEY = "seed_version";
const SEED_VERSION_VALUE = "baseline-v1";
const STOCK_EPSILON = 0.000001;

type SqlRow = Array<string | number | null>;

const PRODUCT_SELECT_COLUMNS = `
  id,
  name,
  COALESCE(barcode, '') as barcode,
  COALESCE(category, '') as category,
  COALESCE(buy_price, 0) as buy_price,
  COALESCE(sell_price, 0) as sell_price,
  COALESCE(quantity, 0) as quantity,
  COALESCE(min_stock, 5) as min_stock,
  COALESCE(unit, 'pcs') as unit,
  created_at
`;

const CUSTOMER_SELECT_COLUMNS = `
  id,
  name,
  COALESCE(phone, '') as phone,
  COALESCE(notes, '') as notes,
  created_at
`;

const TRANSACTION_ITEM_SELECT_COLUMNS = `
  id,
  transaction_id,
  product_id,
  COALESCE(quantity, 0) as quantity,
  COALESCE(unit, 'pcs') as unit,
  COALESCE(unit_price, 0) as unit_price,
  COALESCE(line_total, 0) as line_total
`;

export interface CustomerWithStats extends Customer {
  transaction_count: number;
  total_spent: number;
  fully_paid: number;
  outstanding_debt: number;
}

export interface TransactionItemDetails extends TransactionItem {
  product_name: string;
}

export interface TransactionWithDetails extends Transaction {
  customer_name: string | null;
  outstanding: number;
  items: TransactionItemDetails[];
}

export interface TransactionItemInput {
  productId: number;
  quantity: number;
  unitPrice?: number;
}

type DatabaseErrorCode =
  | "transaction_not_found"
  | "product_not_found"
  | "invalid_quantity"
  | "insufficient_stock";

export class DatabaseOperationError extends Error {
  code: DatabaseErrorCode;
  details: Record<string, string | number>;

  constructor(code: DatabaseErrorCode, message: string, details: Record<string, string | number> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function initDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  const resolvedWasmPath = sqlWasmUrl.startsWith("http")
    ? sqlWasmUrl
    : typeof window !== "undefined"
      ? new URL(sqlWasmUrl, window.location.href).toString()
      : sqlWasmUrl;

  const SQL = await initSqlJs({
    locateFile: (file) => file === "sql-wasm.wasm" ? resolvedWasmPath : file,
  });

  const savedDb = localStorage.getItem(DB_KEY);

  if (savedDb) {
    const uint8Array = new Uint8Array(JSON.parse(savedDb));
    db = new SQL.Database(uint8Array);
  } else {
    db = new SQL.Database();
    createTables(db);
  }

  const didMigrate = migrateDatabase(db);
  const didSeed = seedData(db);

  if (didMigrate || didSeed) {
    saveDatabase();
  }

  return db;
}

function createTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT,
      category TEXT,
      buy_price REAL DEFAULT 0,
      sell_price REAL DEFAULT 0,
      quantity REAL DEFAULT 0,
      min_stock REAL DEFAULT 5,
      unit TEXT DEFAULT 'pcs',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      customer_id INTEGER,
      total_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'fully_paid',
      paid_amount REAL DEFAULT 0,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT DEFAULT 'pcs',
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS shopping_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'restock',
      status TEXT DEFAULT 'active',
      priority TEXT DEFAULT 'medium',
      notes TEXT,
      customer_id INTEGER,
      due_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      product_id INTEGER,
      name TEXT NOT NULL,
      quantity_value REAL DEFAULT 1,
      quantity_label TEXT,
      estimated_unit_cost REAL DEFAULT 0,
      sell_price REAL DEFAULT 0,
      category TEXT,
      notes TEXT,
      is_completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (list_id) REFERENCES shopping_lists(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS shopping_list_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reverted_at DATETIME,
      FOREIGN KEY (list_id) REFERENCES shopping_lists(id)
    );

    CREATE TABLE IF NOT EXISTS shopping_list_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      FOREIGN KEY (transfer_id) REFERENCES shopping_list_transfers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);
}

function migrateDatabase(database: Database): boolean {
  let mutated = false;

  createTables(database);

  const transactionColumns = getTableColumns(database, "transactions");
  if (!transactionColumns.includes("payment_status")) {
    database.run("ALTER TABLE transactions ADD COLUMN payment_status TEXT DEFAULT 'fully_paid'");
    mutated = true;
  }

  if (!transactionColumns.includes("paid_amount")) {
    database.run("ALTER TABLE transactions ADD COLUMN paid_amount REAL DEFAULT 0");
    mutated = true;
  }

  if (runAndDetectChanges(
    database,
    `
      UPDATE transactions
      SET paid_amount = CASE
        WHEN payment_status = 'fully_paid' THEN total_amount
        ELSE COALESCE(paid_amount, 0)
      END
      WHERE paid_amount IS NULL
         OR (paid_amount = 0 AND payment_status = 'fully_paid')
    `,
  )) {
    mutated = true;
  }

  const productColumns = getTableColumns(database, "products");
  if (!productColumns.includes("unit")) {
    database.run("ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'pcs'");
    mutated = true;
  }

  if (runAndDetectChanges(
    database,
    `
      UPDATE products
      SET unit = CASE
        WHEN LOWER(TRIM(COALESCE(category, ''))) = 'mata' THEN 'metr'
        ELSE 'pcs'
      END
      WHERE unit IS NULL
         OR TRIM(unit) = ''
         OR unit NOT IN ('pcs', 'metr')
         OR unit <> CASE
           WHEN LOWER(TRIM(COALESCE(category, ''))) = 'mata' THEN 'metr'
           ELSE 'pcs'
         END
    `,
  )) {
    mutated = true;
  }

  const transactionItemColumns = getTableColumns(database, "transaction_items");
  if (!transactionItemColumns.includes("unit")) {
    database.run("ALTER TABLE transaction_items ADD COLUMN unit TEXT DEFAULT 'pcs'");
    mutated = true;
  }

  if (runAndDetectChanges(
    database,
    `
      UPDATE transaction_items
      SET unit = COALESCE((
        SELECT CASE
          WHEN LOWER(TRIM(COALESCE(products.category, ''))) = 'mata' THEN 'metr'
          ELSE 'pcs'
        END
        FROM products
        WHERE products.id = transaction_items.product_id
      ), 'pcs')
      WHERE unit IS NULL
         OR TRIM(unit) = ''
         OR unit NOT IN ('pcs', 'metr')
         OR unit <> COALESCE((
           SELECT CASE
             WHEN LOWER(TRIM(COALESCE(products.category, ''))) = 'mata' THEN 'metr'
             ELSE 'pcs'
           END
           FROM products
           WHERE products.id = transaction_items.product_id
         ), 'pcs')
    `,
  )) {
    mutated = true;
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'restock',
      status TEXT DEFAULT 'active',
      priority TEXT DEFAULT 'medium',
      notes TEXT,
      customer_id INTEGER,
      due_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  const shoppingListColumns = getTableColumns(database, "shopping_lists");
  if (shoppingListColumns.length > 0) {
    if (!shoppingListColumns.includes("priority")) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN priority TEXT DEFAULT 'medium'");
      mutated = true;
    }

    if (!shoppingListColumns.includes("notes")) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN notes TEXT");
      mutated = true;
    }

    if (!shoppingListColumns.includes("customer_id")) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN customer_id INTEGER");
      mutated = true;
    }

    if (!shoppingListColumns.includes("due_date")) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN due_date DATETIME");
      mutated = true;
    }

    if (!shoppingListColumns.includes("status")) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN status TEXT DEFAULT 'active'");
      mutated = true;
    }

    if (!shoppingListColumns.includes("type")) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN type TEXT DEFAULT 'restock'");
      mutated = true;
    }
  }

  const shoppingListItemColumns = getTableColumns(database, "shopping_list_items");

  if (shoppingListItemColumns.length === 0) {
    database.run(`
      CREATE TABLE IF NOT EXISTS shopping_list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL,
        product_id INTEGER,
        name TEXT NOT NULL,
        quantity_value REAL DEFAULT 1,
        quantity_label TEXT,
        estimated_unit_cost REAL DEFAULT 0,
        sell_price REAL DEFAULT 0,
        category TEXT,
        notes TEXT,
        is_completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (list_id) REFERENCES shopping_lists(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
    mutated = true;
  } else if (!shoppingListItemColumns.includes("list_id")) {
    database.run("ALTER TABLE shopping_list_items RENAME TO shopping_list_items_old");

    database.run(`
      CREATE TABLE shopping_list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL,
        product_id INTEGER,
        name TEXT NOT NULL,
        quantity_value REAL DEFAULT 1,
        quantity_label TEXT,
        estimated_unit_cost REAL DEFAULT 0,
        sell_price REAL DEFAULT 0,
        category TEXT,
        notes TEXT,
        is_completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (list_id) REFERENCES shopping_lists(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    database.run(`
      INSERT INTO shopping_lists (title, type, status)
      VALUES ('General Restock', 'restock', 'active')
    `);

    const defaultListResult = database.exec(`
      SELECT id FROM shopping_lists WHERE title = 'General Restock' ORDER BY id ASC LIMIT 1
    `);
    const defaultListId = Number(defaultListResult[0]?.values?.[0]?.[0] ?? 1);

    const legacyItems = database.exec(`
      SELECT id, name, quantity, notes, is_completed, created_at
      FROM shopping_list_items_old
    `);

    legacyItems[0]?.values.forEach((row) => {
      const legacyQuantity = typeof row[2] === "string" ? row[2] : row[2]?.toString() ?? null;
      const numericQuantity = legacyQuantity ? Number.parseFloat(legacyQuantity) : Number.NaN;

      database.run(
        `
          INSERT INTO shopping_list_items (
            id,
            list_id,
            name,
            quantity_value,
            quantity_label,
            estimated_unit_cost,
            sell_price,
            category,
            notes,
            is_completed,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          row[0],
          defaultListId,
          row[1],
          Number.isFinite(numericQuantity) ? numericQuantity : 1,
          legacyQuantity,
          0,
          0,
          null,
          row[3],
          row[4],
          row[5],
        ],
      );
    });

    database.run("DROP TABLE shopping_list_items_old");
    mutated = true;
  } else {
    if (!shoppingListItemColumns.includes("product_id")) {
      database.run("ALTER TABLE shopping_list_items ADD COLUMN product_id INTEGER");
      mutated = true;
    }

    if (!shoppingListItemColumns.includes("quantity_value")) {
      database.run("ALTER TABLE shopping_list_items ADD COLUMN quantity_value REAL DEFAULT 1");
      mutated = true;
    }

    if (!shoppingListItemColumns.includes("quantity_label")) {
      database.run("ALTER TABLE shopping_list_items ADD COLUMN quantity_label TEXT");
      mutated = true;
    }

    if (!shoppingListItemColumns.includes("estimated_unit_cost")) {
      database.run("ALTER TABLE shopping_list_items ADD COLUMN estimated_unit_cost REAL DEFAULT 0");
      mutated = true;
    }

    if (!shoppingListItemColumns.includes("sell_price")) {
      database.run("ALTER TABLE shopping_list_items ADD COLUMN sell_price REAL DEFAULT 0");
      mutated = true;
    }

    if (!shoppingListItemColumns.includes("category")) {
      database.run("ALTER TABLE shopping_list_items ADD COLUMN category TEXT");
      mutated = true;
    }

    if (shoppingListItemColumns.includes("quantity")) {
      const legacyQuantities = database.exec("SELECT id, quantity FROM shopping_list_items");
      legacyQuantities[0]?.values.forEach((row) => {
        const rawQuantity = typeof row[1] === "string" ? row[1] : row[1]?.toString() ?? null;
        const parsedQuantity = rawQuantity ? Number.parseFloat(rawQuantity) : Number.NaN;
        database.run(
          `
            UPDATE shopping_list_items
            SET quantity_value = ?, quantity_label = COALESCE(quantity_label, ?)
            WHERE id = ?
          `,
          [Number.isFinite(parsedQuantity) ? parsedQuantity : 1, rawQuantity, row[0]],
        );
      });
      mutated = true;
    }
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS shopping_list_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reverted_at DATETIME,
      FOREIGN KEY (list_id) REFERENCES shopping_lists(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS shopping_list_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      FOREIGN KEY (transfer_id) REFERENCES shopping_list_transfers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS payment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    )
  `);

  if (ensureIndex(database, "users", "users_nickname_unique", "CREATE UNIQUE INDEX users_nickname_unique ON users(nickname)")) {
    mutated = true;
  }

  if (ensureIndex(database, "customers", "idx_customers_name_nocase", "CREATE INDEX idx_customers_name_nocase ON customers(name COLLATE NOCASE)")) {
    mutated = true;
  }

  if (ensureIndex(database, "customers", "idx_customers_phone", "CREATE INDEX idx_customers_phone ON customers(phone)")) {
    mutated = true;
  }

  if (ensureIndex(database, "transactions", "idx_transactions_customer_id", "CREATE INDEX idx_transactions_customer_id ON transactions(customer_id)")) {
    mutated = true;
  }

  if (ensureIndex(database, "transactions", "idx_transactions_date", "CREATE INDEX idx_transactions_date ON transactions(date DESC)")) {
    mutated = true;
  }

  if (ensureIndex(database, "transaction_items", "idx_transaction_items_transaction_id", "CREATE INDEX idx_transaction_items_transaction_id ON transaction_items(transaction_id)")) {
    mutated = true;
  }

  if (ensureIndex(database, "transaction_items", "idx_transaction_items_product_id", "CREATE INDEX idx_transaction_items_product_id ON transaction_items(product_id)")) {
    mutated = true;
  }

  if (ensureIndex(database, "payment_logs", "idx_payment_logs_transaction_id", "CREATE INDEX idx_payment_logs_transaction_id ON payment_logs(transaction_id)")) {
    mutated = true;
  }

  return mutated;
}

function ensureMetadataTable(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

function getMetadataValue(database: Database, key: string): string | undefined {
  const stmt = database.prepare("SELECT value FROM metadata WHERE key = ? LIMIT 1");
  try {
    stmt.bind([key]);
    if (stmt.step()) {
      const value = stmt.getAsObject().value;
      return typeof value === "string" ? value : undefined;
    }
    return undefined;
  } finally {
    stmt.free();
  }
}

function setMetadataValue(database: Database, key: string, value: string) {
  database.run(
    `
      INSERT INTO metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    [key, value],
  );
}

function seedData(database: Database): boolean {
  let mutated = false;

  ensureMetadataTable(database);
  const currentVersion = getMetadataValue(database, SEED_VERSION_KEY);

  const defaultUserExists = database.exec(`
    SELECT COUNT(*) FROM users WHERE nickname = 'admin'
  `);

  const userCount = Number(defaultUserExists[0]?.values?.[0]?.[0] ?? 0);
  if (userCount === 0) {
    database.run(
      `
        INSERT INTO users (nickname, password)
        VALUES (?, ?)
      `,
      ["admin", hashPassword("admin123")],
    );
    mutated = true;
  }

  if (currentVersion !== SEED_VERSION_VALUE) {
    setMetadataValue(database, SEED_VERSION_KEY, SEED_VERSION_VALUE);
    mutated = true;
  }

  return mutated;
}

function getTableColumns(database: Database, tableName: string): string[] {
  const result = database.exec(`PRAGMA table_info(${tableName})`);
  return result[0]?.values.map((column) => String(column[1])) ?? [];
}

function ensureIndex(database: Database, tableName: string, indexName: string, createSql: string): boolean {
  const indexList = database.exec(`PRAGMA index_list('${tableName}')`);
  const exists = Boolean(indexList[0]?.values.some((row) => row[1] === indexName));
  if (!exists) {
    database.run(createSql);
    return true;
  }
  return false;
}

function runAndDetectChanges(database: Database, sql: string, params: Array<string | number | null> = []): boolean {
  database.run(sql, params);
  const result = database.exec("SELECT changes()");
  return Number(result[0]?.values?.[0]?.[0] ?? 0) > 0;
}

function withDatabaseTransaction<T>(database: Database, callback: () => T): T {
  database.run("BEGIN");
  try {
    const result = callback();
    database.run("COMMIT");
    return result;
  } catch (error) {
    database.run("ROLLBACK");
    throw error;
  }
}

function buildPlaceholders(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

function mapProductRow(row: SqlRow): Product {
  return {
    id: Number(row[0] ?? 0),
    name: String(row[1] ?? ""),
    barcode: String(row[2] ?? ""),
    category: String(row[3] ?? ""),
    buy_price: Number(row[4] ?? 0),
    sell_price: Number(row[5] ?? 0),
    quantity: Number(row[6] ?? 0),
    min_stock: Number(row[7] ?? 5),
    unit: normalizeProductUnit(typeof row[8] === "string" ? row[8] : undefined),
    created_at: String(row[9] ?? ""),
  };
}

function mapCustomerRow(row: SqlRow): Customer {
  return {
    id: Number(row[0] ?? 0),
    name: String(row[1] ?? ""),
    phone: String(row[2] ?? ""),
    notes: String(row[3] ?? ""),
    created_at: String(row[4] ?? ""),
  };
}

function mapTransactionItemRow(row: SqlRow): TransactionItemDetails {
  return {
    id: Number(row[0] ?? 0),
    transaction_id: Number(row[1] ?? 0),
    product_id: Number(row[2] ?? 0),
    quantity: Number(row[3] ?? 0),
    unit: normalizeProductUnit(typeof row[4] === "string" ? row[4] : undefined),
    unit_price: Number(row[5] ?? 0),
    line_total: Number(row[6] ?? 0),
    product_name: String(row[7] ?? ""),
  };
}

function groupTransactions(rows: SqlRow[]): TransactionWithDetails[] {
  const transactions = new Map<number, TransactionWithDetails>();

  rows.forEach((row) => {
    const transactionId = Number(row[0] ?? 0);
    const existing = transactions.get(transactionId);

    if (!existing) {
      const totalAmount = Number(row[3] ?? 0);
      const paidAmount = Number(row[5] ?? 0);
      transactions.set(transactionId, {
        id: transactionId,
        date: String(row[1] ?? ""),
        customer_id: row[2] === null ? null : Number(row[2]),
        total_amount: totalAmount,
        payment_status: row[4] === "debt" ? "debt" : "fully_paid",
        paid_amount: paidAmount,
        customer_name: row[6] === null ? null : String(row[6]),
        outstanding: Math.max(totalAmount - paidAmount, 0),
        items: [],
      });
    }

    const transaction = transactions.get(transactionId);
    const itemId = row[7];
    if (!transaction || itemId === null) {
      return;
    }

    transaction.items.push(
      mapTransactionItemRow([
        row[7],
        row[8],
        row[9],
        row[10],
        row[11],
        row[12],
        row[13],
        row[14],
      ]),
    );
  });

  return Array.from(transactions.values());
}

function getProductInventoryMap(database: Database, productIds: number[]) {
  if (productIds.length === 0) {
    return new Map<number, Product>();
  }

  const result = database.exec(
    `
      SELECT ${PRODUCT_SELECT_COLUMNS}
      FROM products
      WHERE id IN (${buildPlaceholders(productIds)})
    `,
    productIds,
  );

  const products = new Map<number, Product>();
  result[0]?.values.forEach((row) => {
    const product = mapProductRow(row as SqlRow);
    products.set(product.id, product);
  });

  return products;
}

function normalizeTransactionItems(database: Database, items: TransactionItemInput[]) {
  if (items.length === 0) {
    throw new DatabaseOperationError("invalid_quantity", "At least one item is required");
  }

  const productIds = Array.from(new Set(items.map((item) => item.productId)));
  const productMap = getProductInventoryMap(database, productIds);

  return items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new DatabaseOperationError("product_not_found", "Product not found", { productId: item.productId });
    }

    const quantity = Number(item.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new DatabaseOperationError("invalid_quantity", "Quantity must be greater than zero", {
        productId: item.productId,
        productName: product.name,
      });
    }

    const normalizedQuantity = product.unit === "metr"
      ? Math.round(quantity * 100) / 100
      : Math.round(quantity);

    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new DatabaseOperationError("invalid_quantity", "Quantity must be greater than zero", {
        productId: item.productId,
        productName: product.name,
      });
    }

    const unitPrice = Number.isFinite(item.unitPrice) ? Number(item.unitPrice) : product.sell_price;
    const lineTotal = normalizedQuantity * unitPrice;

    return {
      product,
      quantity: normalizedQuantity,
      unit: product.unit,
      unitPrice,
      lineTotal,
    };
  });
}

function assertStockAvailable(items: ReturnType<typeof normalizeTransactionItems>) {
  items.forEach(({ product, quantity }) => {
    if (quantity - product.quantity > STOCK_EPSILON) {
      throw new DatabaseOperationError("insufficient_stock", "Not enough stock available", {
        productId: product.id,
        productName: product.name,
        available: product.quantity,
        requested: quantity,
      });
    }
  });
}

function getTransactionExists(database: Database, transactionId: number): boolean {
  const result = database.exec("SELECT 1 FROM transactions WHERE id = ? LIMIT 1", [transactionId]);
  return Boolean(result[0]?.values?.length);
}

function getTransactionPaymentSnapshot(database: Database, transactionId: number) {
  const result = database.exec(
    `
      SELECT
        total_amount,
        payment_status,
        COALESCE(paid_amount, CASE WHEN payment_status = 'fully_paid' THEN total_amount ELSE 0 END)
      FROM transactions
      WHERE id = ?
      LIMIT 1
    `,
    [transactionId],
  );

  const row = result[0]?.values?.[0];
  return {
    total_amount: Number(row?.[0] ?? 0),
    payment_status: row?.[1] === "debt" ? "debt" as const : "fully_paid" as const,
    paid_amount: Number(row?.[2] ?? 0),
  };
}

function restoreTransactionStock(database: Database, transactionId: number) {
  const itemsResult = database.exec(
    "SELECT product_id, quantity FROM transaction_items WHERE transaction_id = ?",
    [transactionId],
  );

  itemsResult[0]?.values.forEach((row) => {
    const productId = Number(row[0] ?? 0);
    const quantity = Number(row[1] ?? 0);
    if (productId > 0 && Number.isFinite(quantity) && quantity !== 0) {
      database.run("UPDATE products SET quantity = quantity + ? WHERE id = ?", [quantity, productId]);
    }
  });
}

function deleteTransactionsByWhereClause(whereClause: string, params: Array<string | number | null>) {
  const database = getDatabase();

  withDatabaseTransaction(database, () => {
    const aggregates = database.exec(
      `
        SELECT ti.product_id, SUM(ti.quantity) as total_quantity
        FROM transaction_items ti
        JOIN transactions t ON t.id = ti.transaction_id
        WHERE ${whereClause}
        GROUP BY ti.product_id
      `,
      params,
    );

    aggregates[0]?.values.forEach((row) => {
      const productId = Number(row[0] ?? 0);
      const quantity = Number(row[1] ?? 0);
      if (productId > 0 && Number.isFinite(quantity) && quantity !== 0) {
        database.run("UPDATE products SET quantity = quantity + ? WHERE id = ?", [quantity, productId]);
      }
    });

    database.run(
      `DELETE FROM payment_logs WHERE transaction_id IN (SELECT id FROM transactions WHERE ${whereClause})`,
      params,
    );
    database.run(
      `DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE ${whereClause})`,
      params,
    );
    database.run(`DELETE FROM transactions WHERE ${whereClause}`, params);
  });
}

export function saveDatabase() {
  if (!db) {
    return;
  }
  const data = db.export();
  const buffer = Array.from(data);
  localStorage.setItem(DB_KEY, JSON.stringify(buffer));
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

export function logPayment(transactionId: number, amount: number, note?: string) {
  const database = getDatabase();
  database.run(
    `
      INSERT INTO payment_logs (transaction_id, amount, note)
      VALUES (?, ?, ?)
    `,
    [transactionId, amount, note ?? null],
  );
}

export function listProducts(options: { inStockOnly?: boolean } = {}): Product[] {
  const database = getDatabase();
  const whereClause = options.inStockOnly ? "WHERE quantity > 0" : "";
  const result = database.exec(
    `
      SELECT ${PRODUCT_SELECT_COLUMNS}
      FROM products
      ${whereClause}
      ORDER BY name COLLATE NOCASE ASC
    `,
  );

  return result[0]?.values.map((row) => mapProductRow(row as SqlRow)) ?? [];
}

export function getCustomerById(customerId: number): Customer | null {
  const database = getDatabase();
  const result = database.exec(
    `
      SELECT ${CUSTOMER_SELECT_COLUMNS}
      FROM customers
      WHERE id = ?
      LIMIT 1
    `,
    [customerId],
  );

  const row = result[0]?.values?.[0];
  return row ? mapCustomerRow(row as SqlRow) : null;
}

export function getFirstCustomer(): Customer | null {
  const database = getDatabase();
  const result = database.exec(
    `
      SELECT ${CUSTOMER_SELECT_COLUMNS}
      FROM customers
      ORDER BY name COLLATE NOCASE ASC
      LIMIT 1
    `,
  );

  const row = result[0]?.values?.[0];
  return row ? mapCustomerRow(row as SqlRow) : null;
}

export function searchCustomers(query: string, limit = 50): Customer[] {
  const database = getDatabase();
  const normalizedQuery = query.trim();
  const pattern = `%${normalizedQuery}%`;

  const result = database.exec(
    `
      SELECT ${CUSTOMER_SELECT_COLUMNS}
      FROM customers
      WHERE ? = ''
         OR name LIKE ? COLLATE NOCASE
         OR COALESCE(phone, '') LIKE ? COLLATE NOCASE
      ORDER BY name COLLATE NOCASE ASC
      LIMIT ?
    `,
    [normalizedQuery, pattern, pattern, limit],
  );

  return result[0]?.values.map((row) => mapCustomerRow(row as SqlRow)) ?? [];
}

export function listCustomersWithStats(query = ""): CustomerWithStats[] {
  const database = getDatabase();
  const normalizedQuery = query.trim();
  const pattern = `%${normalizedQuery}%`;

  const result = database.exec(
    `
      SELECT
        c.id,
        c.name,
        COALESCE(c.phone, '') as phone,
        COALESCE(c.notes, '') as notes,
        c.created_at,
        COUNT(t.id) as transaction_count,
        COALESCE(SUM(t.total_amount), 0) as total_spent,
        COALESCE(SUM(COALESCE(t.paid_amount, CASE WHEN t.payment_status = 'fully_paid' THEN t.total_amount ELSE 0 END)), 0) as fully_paid,
        COALESCE(SUM(t.total_amount - COALESCE(t.paid_amount, CASE WHEN t.payment_status = 'fully_paid' THEN t.total_amount ELSE 0 END)), 0) as outstanding_debt
      FROM customers c
      LEFT JOIN transactions t ON t.customer_id = c.id
      WHERE ? = ''
         OR c.name LIKE ? COLLATE NOCASE
         OR COALESCE(c.phone, '') LIKE ? COLLATE NOCASE
      GROUP BY c.id, c.name, c.phone, c.notes, c.created_at
      ORDER BY c.name COLLATE NOCASE ASC
    `,
    [normalizedQuery, pattern, pattern],
  );

  return result[0]?.values.map((row) => {
    const customer = mapCustomerRow(row as SqlRow);
    return {
      ...customer,
      transaction_count: Number(row[5] ?? 0),
      total_spent: Number(row[6] ?? 0),
      fully_paid: Number(row[7] ?? 0),
      outstanding_debt: Number(row[8] ?? 0),
    };
  }) ?? [];
}

export function getTransactionsWithDetails(options: { customerId?: number; transactionId?: number } = {}): TransactionWithDetails[] {
  const database = getDatabase();
  const conditions: string[] = [];
  const params: Array<string | number | null> = [];

  if (options.customerId !== undefined) {
    conditions.push("t.customer_id = ?");
    params.push(options.customerId);
  }

  if (options.transactionId !== undefined) {
    conditions.push("t.id = ?");
    params.push(options.transactionId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = database.exec(
    `
      SELECT
        t.id,
        t.date,
        t.customer_id,
        t.total_amount,
        t.payment_status,
        COALESCE(t.paid_amount, CASE WHEN t.payment_status = 'fully_paid' THEN t.total_amount ELSE 0 END) as paid_amount,
        c.name as customer_name,
        ti.id as item_id,
        ti.transaction_id,
        ti.product_id,
        ti.quantity,
        ti.unit,
        ti.unit_price,
        ti.line_total,
        COALESCE(p.name, '') as product_name
      FROM transactions t
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
      LEFT JOIN products p ON p.id = ti.product_id
      ${whereClause}
      ORDER BY datetime(t.date) DESC, t.id DESC, ti.id ASC
    `,
    params,
  );

  const rows = (result[0]?.values ?? []) as SqlRow[];
  return groupTransactions(rows);
}

export function getTransactionById(transactionId: number): TransactionWithDetails | null {
  return getTransactionsWithDetails({ transactionId })[0] ?? null;
}

export function createSaleTransaction(input: {
  customerId: number;
  paymentStatus: Transaction["payment_status"];
  items: TransactionItemInput[];
}): number {
  const database = getDatabase();

  return withDatabaseTransaction(database, () => {
    const normalizedItems = normalizeTransactionItems(database, input.items);
    assertStockAvailable(normalizedItems);

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const paidAmount = input.paymentStatus === "fully_paid" ? totalAmount : 0;

    database.run(
      `
        INSERT INTO transactions (customer_id, total_amount, payment_status, paid_amount)
        VALUES (?, ?, ?, ?)
      `,
      [input.customerId, totalAmount, input.paymentStatus, paidAmount],
    );

    const result = database.exec("SELECT last_insert_rowid() as id");
    const transactionId = Number(result[0]?.values?.[0]?.[0] ?? 0);

    normalizedItems.forEach((item) => {
      database.run(
        `
          INSERT INTO transaction_items (transaction_id, product_id, quantity, unit, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [transactionId, item.product.id, item.quantity, item.unit, item.unitPrice, item.lineTotal],
      );

      database.run("UPDATE products SET quantity = quantity - ? WHERE id = ?", [item.quantity, item.product.id]);
    });

    return transactionId;
  });
}

export function updateTransactionItems(transactionId: number, items: TransactionItemInput[]) {
  const database = getDatabase();

  if (!getTransactionExists(database, transactionId)) {
    throw new DatabaseOperationError("transaction_not_found", "Transaction not found", { transactionId });
  }

  const transactionSnapshot = getTransactionPaymentSnapshot(database, transactionId);

  withDatabaseTransaction(database, () => {
    restoreTransactionStock(database, transactionId);

    const normalizedItems = normalizeTransactionItems(database, items);
    assertStockAvailable(normalizedItems);

    database.run("DELETE FROM transaction_items WHERE transaction_id = ?", [transactionId]);

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const nextPaidAmount = Math.min(Math.max(transactionSnapshot.paid_amount, 0), totalAmount);
    const nextStatus = totalAmount - nextPaidAmount > STOCK_EPSILON ? "debt" : "fully_paid";

    normalizedItems.forEach((item) => {
      database.run(
        `
          INSERT INTO transaction_items (transaction_id, product_id, quantity, unit, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [transactionId, item.product.id, item.quantity, item.unit, item.unitPrice, item.lineTotal],
      );
      database.run("UPDATE products SET quantity = quantity - ? WHERE id = ?", [item.quantity, item.product.id]);
    });

    database.run(
      `
        UPDATE transactions
        SET total_amount = ?, paid_amount = ?, payment_status = ?
        WHERE id = ?
      `,
      [totalAmount, nextPaidAmount, nextStatus, transactionId],
    );

    const paymentDelta = nextPaidAmount - transactionSnapshot.paid_amount;
    if (Math.abs(paymentDelta) > STOCK_EPSILON) {
      database.run(
        `
          INSERT INTO payment_logs (transaction_id, amount, note)
          VALUES (?, ?, ?)
        `,
        [transactionId, paymentDelta, "Transaction total adjusted"],
      );
    }
  });
}

export function deleteTransaction(transactionId: number) {
  const database = getDatabase();

  if (!getTransactionExists(database, transactionId)) {
    throw new DatabaseOperationError("transaction_not_found", "Transaction not found", { transactionId });
  }

  withDatabaseTransaction(database, () => {
    restoreTransactionStock(database, transactionId);
    database.run("DELETE FROM payment_logs WHERE transaction_id = ?", [transactionId]);
    database.run("DELETE FROM transaction_items WHERE transaction_id = ?", [transactionId]);
    database.run("DELETE FROM transactions WHERE id = ?", [transactionId]);
  });
}

export function deleteTransactionsByCustomer(customerId: number) {
  deleteTransactionsByWhereClause("customer_id = ?", [customerId]);
}

export function deleteAllTransactions() {
  deleteTransactionsByWhereClause("1 = 1", []);
}

export function exportDatabaseAsJSON(): string {
  const database = getDatabase();

  const products = database.exec(`
    SELECT ${PRODUCT_SELECT_COLUMNS}
    FROM products
    ORDER BY id ASC
  `);
  const customers = database.exec(`
    SELECT ${CUSTOMER_SELECT_COLUMNS}
    FROM customers
    ORDER BY id ASC
  `);
  const transactions = database.exec(`
    SELECT id, date, customer_id, total_amount, payment_status, paid_amount
    FROM transactions
    ORDER BY id ASC
  `);
  const transactionItems = database.exec(`
    SELECT ${TRANSACTION_ITEM_SELECT_COLUMNS}
    FROM transaction_items
    ORDER BY id ASC
  `);
  const shoppingLists = database.exec(`
    SELECT id, title, type, status, priority, notes, customer_id, due_date, created_at
    FROM shopping_lists
    ORDER BY id ASC
  `);
  const shoppingListItems = database.exec(`
    SELECT id, list_id, product_id, name, quantity_value, quantity_label, estimated_unit_cost, sell_price, category, notes, is_completed, created_at
    FROM shopping_list_items
    ORDER BY id ASC
  `);
  const paymentLogs = database.exec(`
    SELECT id, transaction_id, amount, note, created_at
    FROM payment_logs
    ORDER BY id ASC
  `);
  const shoppingListTransfers = database.exec(`
    SELECT id, list_id, created_at, reverted_at
    FROM shopping_list_transfers
    ORDER BY id ASC
  `);
  const shoppingListTransferItems = database.exec(`
    SELECT id, transfer_id, product_id, quantity
    FROM shopping_list_transfer_items
    ORDER BY id ASC
  `);

  return JSON.stringify(
    {
      products: products[0]?.values || [],
      customers: customers[0]?.values || [],
      transactions: transactions[0]?.values || [],
      transaction_items: transactionItems[0]?.values || [],
      shopping_lists: shoppingLists[0]?.values || [],
      shopping_list_items: shoppingListItems[0]?.values || [],
      payment_logs: paymentLogs[0]?.values || [],
      shopping_list_transfers: shoppingListTransfers[0]?.values || [],
      shopping_list_transfer_items: shoppingListTransferItems[0]?.values || [],
    },
    null,
    2,
  );
}

export function importDatabaseFromJSON(jsonData: string) {
  try {
    const data = JSON.parse(jsonData);
    const database = getDatabase();

    withDatabaseTransaction(database, () => {
      database.run("DELETE FROM shopping_list_transfer_items");
      database.run("DELETE FROM shopping_list_transfers");
      database.run("DELETE FROM shopping_list_items");
      database.run("DELETE FROM shopping_lists");
      database.run("DELETE FROM payment_logs");
      database.run("DELETE FROM transaction_items");
      database.run("DELETE FROM transactions");
      database.run("DELETE FROM customers");
      database.run("DELETE FROM products");

      if (Array.isArray(data.products)) {
        data.products.forEach((row: SqlRow) => {
          const hasUnitColumn = row.length >= 10;
          const unit = hasUnitColumn
            ? normalizeProductUnit(typeof row[8] === "string" ? row[8] : undefined)
            : resolveProductUnit(typeof row[3] === "string" ? row[3] : null);
          const createdAtIndex = hasUnitColumn ? 9 : 8;

          database.run(
            `
              INSERT INTO products (id, name, barcode, category, buy_price, sell_price, quantity, min_stock, unit, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              row[0],
              row[1] ?? "",
              row[2] ?? null,
              row[3] ?? null,
              Number(row[4] ?? 0),
              Number(row[5] ?? 0),
              Number(row[6] ?? 0),
              Number(row[7] ?? 5),
              unit,
              row[createdAtIndex] ?? new Date().toISOString(),
            ],
          );
        });
      }

      if (Array.isArray(data.customers)) {
        data.customers.forEach((row: SqlRow) => {
          database.run(
            `
              INSERT INTO customers (id, name, phone, notes, created_at)
              VALUES (?, ?, ?, ?, ?)
            `,
            [row[0], row[1] ?? "", row[2] ?? null, row[3] ?? null, row[4] ?? new Date().toISOString()],
          );
        });
      }

      if (Array.isArray(data.transactions)) {
        data.transactions.forEach((row: SqlRow) => {
          const id = row[0];
          const date = row[1] ?? new Date().toISOString();
          const customerId = row[2] ?? null;
          const totalAmount = Number(row[3] ?? 0);
          let paymentStatusRaw = row[4];
          let paidAmountRaw = row[5];

          if (row.length === 5 && typeof row[4] !== "string") {
            paidAmountRaw = row[4];
            paymentStatusRaw = Number(paidAmountRaw ?? 0) >= totalAmount ? "fully_paid" : "debt";
          }

          const paymentStatus = paymentStatusRaw === "debt" ? "debt" : "fully_paid";
          const paidAmount = row.length >= 6 || typeof paidAmountRaw === "number"
            ? Number(paidAmountRaw ?? (paymentStatus === "fully_paid" ? totalAmount : 0))
            : paymentStatus === "fully_paid"
              ? totalAmount
              : 0;

          database.run(
            `
              INSERT INTO transactions (id, date, customer_id, total_amount, payment_status, paid_amount)
              VALUES (?, ?, ?, ?, ?, ?)
            `,
            [id, date, customerId, totalAmount, paymentStatus, paidAmount],
          );
        });
      }

      if (Array.isArray(data.transaction_items)) {
        data.transaction_items.forEach((row: SqlRow) => {
          const hasUnitColumn = row.length >= 7;
          const unit = hasUnitColumn
            ? normalizeProductUnit(typeof row[4] === "string" ? row[4] : undefined)
            : resolveImportedTransactionUnit(database, row[2]);

          database.run(
            `
              INSERT INTO transaction_items (id, transaction_id, product_id, quantity, unit, unit_price, line_total)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            hasUnitColumn
              ? [row[0], row[1], row[2], Number(row[3] ?? 0), unit, Number(row[5] ?? 0), Number(row[6] ?? 0)]
              : [row[0], row[1], row[2], Number(row[3] ?? 0), unit, Number(row[4] ?? 0), Number(row[5] ?? 0)],
          );
        });
      }

      if (Array.isArray(data.shopping_lists)) {
        data.shopping_lists.forEach((row: SqlRow) => {
          database.run(
            `
              INSERT INTO shopping_lists (id, title, type, status, priority, notes, customer_id, due_date, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              row[0],
              row[1] ?? "Untitled list",
              row[2] ?? "restock",
              row[3] ?? "active",
              row[4] ?? "medium",
              row[5] ?? null,
              row[6] ?? null,
              row[7] ?? null,
              row[8] ?? new Date().toISOString(),
            ],
          );
        });
      }

      if (Array.isArray(data.shopping_list_items)) {
        data.shopping_list_items.forEach((row: SqlRow) => {
          const hasExtendedColumns = row.length >= 12;

          database.run(
            `
              INSERT INTO shopping_list_items (
                id,
                list_id,
                product_id,
                name,
                quantity_value,
                quantity_label,
                estimated_unit_cost,
                sell_price,
                category,
                notes,
                is_completed,
                created_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            hasExtendedColumns
              ? [
                  row[0],
                  row[1],
                  row[2] ?? null,
                  row[3] ?? "Item",
                  Number(row[4] ?? 1),
                  row[5] ?? null,
                  Number(row[6] ?? 0),
                  Number(row[7] ?? 0),
                  row[8] ?? null,
                  row[9] ?? null,
                  Number(row[10] ?? 0),
                  row[11] ?? new Date().toISOString(),
                ]
              : [
                  row[0],
                  row[1],
                  row[2] ?? null,
                  row[3] ?? "Item",
                  Number(row[4] ?? 1),
                  row[5] ?? null,
                  Number(row[6] ?? 0),
                  0,
                  null,
                  row[7] ?? null,
                  Number(row[8] ?? 0),
                  row[9] ?? new Date().toISOString(),
                ],
          );
        });
      }

      if (Array.isArray(data.shopping_list_transfers)) {
        data.shopping_list_transfers.forEach((row: SqlRow) => {
          database.run(
            `
              INSERT INTO shopping_list_transfers (id, list_id, created_at, reverted_at)
              VALUES (?, ?, ?, ?)
            `,
            [row[0], row[1], row[2] ?? new Date().toISOString(), row[3] ?? null],
          );
        });
      }

      if (Array.isArray(data.shopping_list_transfer_items)) {
        data.shopping_list_transfer_items.forEach((row: SqlRow) => {
          database.run(
            `
              INSERT INTO shopping_list_transfer_items (id, transfer_id, product_id, quantity)
              VALUES (?, ?, ?, ?)
            `,
            [row[0], row[1], row[2], Number(row[3] ?? 0)],
          );
        });
      }

      if (Array.isArray(data.payment_logs)) {
        data.payment_logs.forEach((row: SqlRow) => {
          database.run(
            `
              INSERT INTO payment_logs (id, transaction_id, amount, note, created_at)
              VALUES (?, ?, ?, ?, ?)
            `,
            [row[0], row[1], Number(row[2] ?? 0), row[3] ?? null, row[4] ?? new Date().toISOString()],
          );
        });
      }
    });

    saveDatabase();
    return true;
  } catch (error) {
    console.error("Import failed:", error);
    return false;
  }
}

function resolveImportedTransactionUnit(database: Database, productId: string | number | null): ProductUnit {
  if (productId === null) {
    return "pcs";
  }

  const result = database.exec("SELECT unit, category FROM products WHERE id = ? LIMIT 1", [productId]);
  const row = result[0]?.values?.[0];
  if (!row) {
    return "pcs";
  }

  if (typeof row[0] === "string") {
    return normalizeProductUnit(row[0]);
  }

  return resolveProductUnit(typeof row[1] === "string" ? row[1] : null);
}
