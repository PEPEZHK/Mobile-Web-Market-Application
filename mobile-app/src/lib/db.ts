import initSqlJs, { Database } from 'sql.js';
import sqlWasmUrl from '../assets/sql-wasm.wasm?url';
import { hashPassword } from './auth';

let db: Database | null = null;

const DB_KEY = 'magazin-proekt-db';
const SEED_VERSION_KEY = 'seed_version';
const SEED_VERSION_VALUE = 'baseline-v1';
type SqlRow = Array<string | number | null>;

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const resolvedWasmPath = sqlWasmUrl.startsWith('http')
    ? sqlWasmUrl
    : (typeof window !== 'undefined'
        ? new URL(sqlWasmUrl, window.location.href).toString()
        : sqlWasmUrl);

  const SQL = await initSqlJs({
    locateFile: (file) => file === 'sql-wasm.wasm' ? resolvedWasmPath : file
  });

  const savedDb = localStorage.getItem(DB_KEY);

  if (savedDb) {
    const uint8Array = new Uint8Array(JSON.parse(savedDb));
    db = new SQL.Database(uint8Array);
  } else {
    db = new SQL.Database();
    createTables(db);
  }

  migrateDatabase(db);

  const didSeed = seedData(db);
  if (didSeed) {
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
      quantity INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
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
      quantity INTEGER NOT NULL,
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
  `);
}

function migrateDatabase(database: Database) {
  const result = database.exec("PRAGMA table_info(transactions)");
  const hasPaymentStatus = result[0]?.values.some(column => column[1] === 'payment_status');
  const hasPaidAmount = result[0]?.values.some(column => column[1] === 'paid_amount');

  if (!hasPaymentStatus) {
    database.run("ALTER TABLE transactions ADD COLUMN payment_status TEXT DEFAULT 'fully_paid'");
  }

  if (!hasPaidAmount) {
    database.run("ALTER TABLE transactions ADD COLUMN paid_amount REAL DEFAULT 0");
  }

  // Backfill paid amounts for legacy rows
  database.run(`
    UPDATE transactions
    SET paid_amount = CASE
      WHEN payment_status = 'fully_paid' THEN total_amount
      ELSE paid_amount
    END
    WHERE paid_amount IS NULL OR (paid_amount = 0 AND payment_status = 'fully_paid')
  `);

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

  const shoppingListsInfo = database.exec("PRAGMA table_info(shopping_lists)");
  const shoppingListColumns = shoppingListsInfo[0]?.values.map(column => column[1]);

  if (shoppingListColumns) {
    if (!shoppingListColumns.includes('priority')) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN priority TEXT DEFAULT 'medium'");
    }

    if (!shoppingListColumns.includes('notes')) {
      database.run('ALTER TABLE shopping_lists ADD COLUMN notes TEXT');
    }

    if (!shoppingListColumns.includes('customer_id')) {
      database.run('ALTER TABLE shopping_lists ADD COLUMN customer_id INTEGER');
    }

    if (!shoppingListColumns.includes('due_date')) {
      database.run('ALTER TABLE shopping_lists ADD COLUMN due_date DATETIME');
    }

    if (!shoppingListColumns.includes('status')) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN status TEXT DEFAULT 'active'");
    }

    if (!shoppingListColumns.includes('type')) {
      database.run("ALTER TABLE shopping_lists ADD COLUMN type TEXT DEFAULT 'restock'");
    }
  }

  const shoppingListItemsInfo = database.exec("PRAGMA table_info(shopping_list_items)");

  if (!shoppingListItemsInfo[0]) {
    database.run(`
      CREATE TABLE IF NOT EXISTS shopping_list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL,
        product_id INTEGER,
        name TEXT NOT NULL,
        quantity_value REAL DEFAULT 1,
        quantity_label TEXT,
        estimated_unit_cost REAL DEFAULT 0,
        notes TEXT,
        is_completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (list_id) REFERENCES shopping_lists(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
  } else {
    const shoppingListItemsColumns = shoppingListItemsInfo[0].values.map(column => column[1] as string);

    if (!shoppingListItemsColumns.includes('list_id')) {
      database.run('ALTER TABLE shopping_list_items RENAME TO shopping_list_items_old');

      database.run(`
        CREATE TABLE shopping_list_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          list_id INTEGER NOT NULL,
          product_id INTEGER,
          name TEXT NOT NULL,
          quantity_value REAL DEFAULT 1,
          quantity_label TEXT,
          estimated_unit_cost REAL DEFAULT 0,
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
      const defaultListId = defaultListResult[0]?.values[0]?.[0] ?? 1;

      const legacyItems = database.exec(`
        SELECT id, name, quantity, notes, is_completed, created_at
        FROM shopping_list_items_old
      `);

      if (legacyItems[0]) {
        legacyItems[0].values.forEach(row => {
          const legacyQuantity = row[2] as string | null;
          const numericQuantity = legacyQuantity ? parseFloat(legacyQuantity) : NaN;
          database.run(
            `INSERT INTO shopping_list_items (id, list_id, name, quantity_value, quantity_label, notes, is_completed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
            [
              row[0],
              defaultListId,
              row[1],
              Number.isFinite(numericQuantity) ? numericQuantity : 1,
              legacyQuantity || null,
              row[3],
              row[4],
              row[5]
            ]
          );
        });
      }

      database.run('DROP TABLE shopping_list_items_old');
    } else {
      const needsProductId = !shoppingListItemsColumns.includes('product_id');
      if (needsProductId) {
        database.run('ALTER TABLE shopping_list_items ADD COLUMN product_id INTEGER');
      }

      const needsQuantityValue = !shoppingListItemsColumns.includes('quantity_value');
      if (needsQuantityValue) {
        database.run('ALTER TABLE shopping_list_items ADD COLUMN quantity_value REAL DEFAULT 1');
      }

      const needsQuantityLabel = !shoppingListItemsColumns.includes('quantity_label');
      if (needsQuantityLabel) {
        database.run('ALTER TABLE shopping_list_items ADD COLUMN quantity_label TEXT');
      }

      const needsEstimatedCost = !shoppingListItemsColumns.includes('estimated_unit_cost');
      if (needsEstimatedCost) {
        database.run('ALTER TABLE shopping_list_items ADD COLUMN estimated_unit_cost REAL DEFAULT 0');
      }

      const needsSellPrice = !shoppingListItemsColumns.includes('sell_price');
      if (needsSellPrice) {
        database.run('ALTER TABLE shopping_list_items ADD COLUMN sell_price REAL DEFAULT 0');
      }

      const needsCategory = !shoppingListItemsColumns.includes('category');
      if (needsCategory) {
        database.run('ALTER TABLE shopping_list_items ADD COLUMN category TEXT');
      }

      if (shoppingListItemsColumns.includes('quantity')) {
        const legacyQuantities = database.exec('SELECT id, quantity FROM shopping_list_items');
        if (legacyQuantities[0]) {
          legacyQuantities[0].values.forEach(row => {
            const id = row[0] as number;
            const rawQuantity = row[1] as string | null;
            const parsedQuantity = rawQuantity ? parseFloat(rawQuantity) : NaN;
            database.run(
              'UPDATE shopping_list_items SET quantity_value = ?, quantity_label = COALESCE(quantity_label, ?) WHERE id = ?',
              [
                Number.isFinite(parsedQuantity) ? parsedQuantity : 1,
                rawQuantity,
                id
              ]
            );
          });
        }
      }
    }
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const hasNicknameUniqueIndex = database.exec("PRAGMA index_list('users')");
  const nicknameIndexExists = Boolean(hasNicknameUniqueIndex[0]?.values?.some(row => row[1] === 'users_nickname_unique'));
  if (!nicknameIndexExists) {
    database.run('CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_unique ON users(nickname)');
  }

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
  const stmt = database.prepare(`SELECT value FROM metadata WHERE key = ? LIMIT 1`);
  try {
    stmt.bind([key]);
    if (stmt.step()) {
      const value = stmt.getAsObject().value;
      return typeof value === 'string' ? value : undefined;
    }
    return undefined;
  } finally {
    stmt.free();
  }
}

function setMetadataValue(database: Database, key: string, value: string) {
  database.run(
    `INSERT INTO metadata (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

function seedData(database: Database): boolean {
  let mutated = false;

  ensureMetadataTable(database);
  const currentVersion = getMetadataValue(database, SEED_VERSION_KEY);

  const defaultUserExists = database.exec(`
    SELECT COUNT(*) FROM users WHERE nickname = 'admin'
  `);

  const userCount = defaultUserExists[0]?.values?.[0]?.[0] as number | undefined;
  if (!userCount || userCount === 0) {
    database.run(`
      INSERT INTO users (nickname, password)
      VALUES (?, ?)
    `, ['admin', hashPassword('admin123')]);
    mutated = true;
  }

  if (currentVersion !== SEED_VERSION_VALUE) {
    setMetadataValue(database, SEED_VERSION_KEY, SEED_VERSION_VALUE);
    mutated = true;
  }

  return mutated;
}

export function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Array.from(data);
  localStorage.setItem(DB_KEY, JSON.stringify(buffer));
}

export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function logPayment(transactionId: number, amount: number, note?: string) {
  const database = getDatabase();
  database.run(
    `INSERT INTO payment_logs (transaction_id, amount, note)
     VALUES (?, ?, ?)`,
    [transactionId, amount, note ?? null]
  );
}

export function exportDatabaseAsJSON(): string {
  const database = getDatabase();

  const products = database.exec('SELECT * FROM products');
  const customers = database.exec('SELECT * FROM customers');
  const transactions = database.exec('SELECT * FROM transactions');
  const transactionItems = database.exec('SELECT * FROM transaction_items');
  const shoppingLists = database.exec('SELECT * FROM shopping_lists');
  const shoppingListItems = database.exec('SELECT * FROM shopping_list_items');
  const paymentLogs = database.exec('SELECT * FROM payment_logs');

  return JSON.stringify({
    products: products[0]?.values || [],
    customers: customers[0]?.values || [],
    transactions: transactions[0]?.values || [],
    transaction_items: transactionItems[0]?.values || [],
    shopping_lists: shoppingLists[0]?.values || [],
    shopping_list_items: shoppingListItems[0]?.values || [],
    payment_logs: paymentLogs[0]?.values || []
  }, null, 2);
}

export function importDatabaseFromJSON(jsonData: string) {
  try {
    const data = JSON.parse(jsonData);
    const database = getDatabase();

    database.run('DELETE FROM shopping_list_items');
    database.run('DELETE FROM shopping_lists');
    database.run('DELETE FROM transaction_items');
    database.run('DELETE FROM transactions');
    database.run('DELETE FROM customers');
    database.run('DELETE FROM products');
    database.run('DELETE FROM payment_logs');

    if (data.products) {
      data.products.forEach((row: SqlRow) => {
        database.run(
          'INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          row
        );
      });
    }

    if (data.customers) {
      data.customers.forEach((row: SqlRow) => {
        database.run(
          'INSERT INTO customers VALUES (?, ?, ?, ?, ?)',
          row
        );
      });
    }

    if (data.transactions) {
      data.transactions.forEach((row: SqlRow) => {
        const [
          id,
          date,
          customer_id,
          total_amount,
          payment_status_raw,
          paid_amount_raw
        ] = row;

        const payment_status = payment_status_raw === 'debt' ? 'debt' : 'fully_paid';
        const normalizedTotal = typeof total_amount === 'number' ? total_amount : Number(total_amount ?? 0) || 0;
        const paid_amount = typeof paid_amount_raw === 'number'
          ? paid_amount_raw
          : payment_status === 'fully_paid'
            ? normalizedTotal
            : 0;

        database.run(
          'INSERT INTO transactions (id, date, customer_id, total_amount, payment_status, paid_amount) VALUES (?, ?, ?, ?, ?, ?)',
          [
            id,
            date ?? new Date().toISOString(),
            customer_id ?? null,
            normalizedTotal,
            payment_status,
            paid_amount
          ]
        );
      });
    }

    if (data.transaction_items) {
      data.transaction_items.forEach((row: SqlRow) => {
        database.run(
          'INSERT INTO transaction_items VALUES (?, ?, ?, ?, ?, ?)',
          row
        );
      });
    }

    if (data.shopping_lists) {
      data.shopping_lists.forEach((row: SqlRow) => {
        const [
          id,
          title,
          type,
          status,
          priority,
          notes,
          customer_id,
          due_date,
          created_at
        ] = [
          row[0],
          row[1] ?? 'Untitled list',
          row[2] ?? 'restock',
          row[3] ?? 'active',
          row[4] ?? 'medium',
          row[5] ?? null,
          row[6] ?? null,
          row[7] ?? null,
          row[8] ?? new Date().toISOString()
        ];

        database.run(
          'INSERT INTO shopping_lists (id, title, type, status, priority, notes, customer_id, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, title, type, status, priority, notes, customer_id, due_date, created_at]
        );
      });
    }

    if (data.shopping_list_items) {
      data.shopping_list_items.forEach((row: SqlRow) => {
        const [
          id,
          list_id,
          product_id,
          name,
          quantity_value,
          quantity_label,
          estimated_unit_cost,
          notes,
          is_completed,
          created_at
        ] = [
          row[0],
          row[1],
          row[2] ?? null,
          row[3] ?? 'Item',
          row[4] ?? 1,
          row[5] ?? null,
          row[6] ?? 0,
          row[7] ?? null,
          row[8] ?? 0,
          row[9] ?? new Date().toISOString()
        ];

        database.run(
          `INSERT INTO shopping_list_items (id, list_id, product_id, name, quantity_value, quantity_label, estimated_unit_cost, notes, is_completed, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, list_id, product_id, name, quantity_value, quantity_label, estimated_unit_cost, notes, is_completed, created_at]
        );
      });
    }

    if (data.payment_logs) {
      data.payment_logs.forEach((row: SqlRow) => {
        database.run(
          'INSERT INTO payment_logs VALUES (?, ?, ?, ?, ?)',
          row
        );
      });
    }

    saveDatabase();
    return true;
  } catch (error) {
    console.error('Import failed:', error);
    return false;
  }
}
