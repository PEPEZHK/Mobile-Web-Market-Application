import initSqlJs, { Database } from 'sql.js';

let db: Database | null = null;

const DB_KEY = 'magazin-proekt-db';

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`
  });

  // Try to load existing database from localStorage
  const savedDb = localStorage.getItem(DB_KEY);
  if (savedDb) {
    const uint8Array = new Uint8Array(JSON.parse(savedDb));
    db = new SQL.Database(uint8Array);
  } else {
    db = new SQL.Database();
    createTables(db);
    seedData(db);
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
  `);
}

function seedData(database: Database) {
  // Seed products
  database.run(`
    INSERT INTO products (name, barcode, category, buy_price, sell_price, quantity, min_stock)
    VALUES 
      ('Laptop HP ProBook', 'LP001', 'Electronics', 450.00, 650.00, 15, 3),
      ('Wireless Mouse', 'MS001', 'Electronics', 8.00, 15.00, 50, 10),
      ('USB-C Cable', 'CB001', 'Accessories', 3.00, 7.00, 100, 20),
      ('Office Chair', 'CH001', 'Furniture', 80.00, 150.00, 8, 2),
      ('Notebook A4', 'NB001', 'Stationery', 1.50, 3.50, 200, 30);
  `);

  // Seed customers
  database.run(`
    INSERT INTO customers (name, phone, notes)
    VALUES 
      ('Tech Solutions Ltd', '+1234567890', 'Regular corporate client'),
      ('Small Office Co', '+0987654321', 'Monthly orders');
  `);

  // Seed a sample transaction
  database.run(`
    INSERT INTO transactions (customer_id, total_amount, date)
    VALUES (1, 30.00, datetime('now', '-2 days'));
  `);

  const result = database.exec('SELECT last_insert_rowid() as id');
  const transactionId = result[0].values[0][0];

  database.run(`
    INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, line_total)
    VALUES 
      (${transactionId}, 2, 2, 15.00, 30.00);
  `);

  // Update product quantity
  database.run(`UPDATE products SET quantity = quantity - 2 WHERE id = 2`);
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

export function exportDatabaseAsJSON(): string {
  const database = getDatabase();
  
  const products = database.exec('SELECT * FROM products');
  const customers = database.exec('SELECT * FROM customers');
  const transactions = database.exec('SELECT * FROM transactions');
  const transactionItems = database.exec('SELECT * FROM transaction_items');

  return JSON.stringify({
    products: products[0]?.values || [],
    customers: customers[0]?.values || [],
    transactions: transactions[0]?.values || [],
    transaction_items: transactionItems[0]?.values || []
  }, null, 2);
}

export function importDatabaseFromJSON(jsonData: string) {
  try {
    const data = JSON.parse(jsonData);
    const database = getDatabase();

    // Clear existing data
    database.run('DELETE FROM transaction_items');
    database.run('DELETE FROM transactions');
    database.run('DELETE FROM customers');
    database.run('DELETE FROM products');

    // Import products
    if (data.products) {
      data.products.forEach((row: any[]) => {
        database.run(
          'INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          row
        );
      });
    }

    // Import customers
    if (data.customers) {
      data.customers.forEach((row: any[]) => {
        database.run(
          'INSERT INTO customers VALUES (?, ?, ?, ?, ?)',
          row
        );
      });
    }

    // Import transactions
    if (data.transactions) {
      data.transactions.forEach((row: any[]) => {
        database.run(
          'INSERT INTO transactions VALUES (?, ?, ?, ?)',
          row
        );
      });
    }

    // Import transaction items
    if (data.transaction_items) {
      data.transaction_items.forEach((row: any[]) => {
        database.run(
          'INSERT INTO transaction_items VALUES (?, ?, ?, ?, ?, ?)',
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
