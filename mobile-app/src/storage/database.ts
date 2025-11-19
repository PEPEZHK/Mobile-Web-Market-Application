import * as SQLite from 'expo-sqlite';
import { hashPassword } from '../lib/auth';
import type {
  Product,
  ShoppingList,
  ShoppingListWithStats,
  ShoppingListItemWithProduct,
  User
} from '../types';

const DB_NAME = 'offline-stock.db';
const SCHEMA_VERSION = 1;
const SEED_VERSION = 'baseline-v1';

let database: SQLite.SQLiteDatabase | null = null;
let initializing = false;

async function openDatabase() {
  if (database) {
    return database;
  }

  database = await SQLite.openDatabaseAsync(DB_NAME);
  await database.execAsync('PRAGMA foreign_keys = ON;');
  return database;
}

export async function initDatabase(force = false) {
  if (force && database) {
    await database.closeAsync();
    database = null;
  }

  const db = await openDatabase();
  if (initializing) {
    return db;
  }

  initializing = true;
  try {
    await ensureMetadataTable(db);
    await ensureSchema(db);
    await ensureSeedData(db);
  } finally {
    initializing = false;
  }

  return db;
}

export async function resetDatabase() {
  const db = await openDatabase();
  await db.execAsync(`
    DROP TABLE IF EXISTS shopping_list_items;
    DROP TABLE IF EXISTS shopping_lists;
    DROP TABLE IF EXISTS transaction_items;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS metadata;
  `);
  await initDatabase(true);
}

async function ensureMetadataTable(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

async function ensureSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
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
      notes TEXT,
      is_completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (list_id) REFERENCES shopping_lists(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  await setMetadata(db, 'schema_version', String(SCHEMA_VERSION));
}

async function ensureSeedData(db: SQLite.SQLiteDatabase) {
  const seedVersion = await getMetadata(db, 'seed_version');
  if (seedVersion === SEED_VERSION) {
    return;
  }

  const adminHash = hashPassword('admin123');
  await db.runAsync(
    `INSERT OR IGNORE INTO users (nickname, password) VALUES (?, ?);`,
    ['admin', adminHash]
  );

  const listResult = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM shopping_lists'
  );
  if (!listResult || listResult.count === 0) {
    await db.runAsync(
      `INSERT INTO shopping_lists (title, type, status, priority, notes)
       VALUES (?, 'restock', 'active', 'medium', ?);`,
      ['General Restock', 'Quick list to capture items you are low on']
    );
  }

  await setMetadata(db, 'seed_version', SEED_VERSION);
}

async function getMetadata(db: SQLite.SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM metadata WHERE key = ? LIMIT 1',
    [key]
  );
  return row?.value;
}

async function setMetadata(db: SQLite.SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO metadata (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value]
  );
}

export interface ProductInput {
  name: string;
  barcode?: string;
  category?: string;
  buy_price?: number;
  sell_price?: number;
  quantity?: number;
  min_stock?: number;
}

export async function fetchProducts(): Promise<Product[]> {
  const db = await initDatabase();
  return db.getAllAsync<Product>(
    `SELECT * FROM products ORDER BY name COLLATE NOCASE;`
  );
}

export async function createProduct(input: ProductInput) {
  const db = await initDatabase();
  const result = await db.runAsync(
    `INSERT INTO products (name, barcode, category, buy_price, sell_price, quantity, min_stock)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      input.name.trim(),
      input.barcode || null,
      input.category || null,
      input.buy_price ?? 0,
      input.sell_price ?? 0,
      input.quantity ?? 0,
      input.min_stock ?? 5
    ]
  );
  return result.lastInsertRowId as number;
}

export async function adjustProductQuantity(productId: number, delta: number) {
  const db = await initDatabase();
  await db.runAsync(
    `UPDATE products SET quantity = MAX(quantity + ?, 0) WHERE id = ?;`,
    [delta, productId]
  );
}

export async function fetchShoppingLists(): Promise<ShoppingListWithStats[]> {
  const db = await initDatabase();
  return db.getAllAsync<ShoppingListWithStats>(
    `SELECT
       sl.id,
      sl.title,
      sl.type,
      sl.status,
      sl.priority,
      sl.notes,
      sl.customer_id,
      sl.due_date,
      sl.created_at,
      c.name AS customer_name,
      COALESCE(SUM(CASE WHEN sli.is_completed = 0 THEN 1 ELSE 0 END), 0) AS pending_count,
      COALESCE(SUM(CASE WHEN sli.is_completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count,
      COALESCE(SUM(sli.estimated_unit_cost * sli.quantity_value), 0) AS estimated_total,
      COALESCE(SUM(CASE WHEN sli.is_completed = 0 THEN sli.estimated_unit_cost * sli.quantity_value ELSE 0 END), 0) AS pending_estimated_total
    FROM shopping_lists sl
    LEFT JOIN customers c ON c.id = sl.customer_id
    LEFT JOIN shopping_list_items sli ON sli.list_id = sl.id
    GROUP BY sl.id
    ORDER BY sl.created_at DESC;`
  );
}

export interface ShoppingListInput {
  title: string;
  notes?: string;
  type?: 'restock' | 'customer_order';
  priority?: 'low' | 'medium' | 'high';
}

export async function createShoppingList(input: ShoppingListInput) {
  const db = await initDatabase();
  const result = await db.runAsync(
    `INSERT INTO shopping_lists (title, notes, type, priority)
     VALUES (?, ?, ?, ?);`,
    [
      input.title.trim(),
      input.notes || null,
      input.type || 'restock',
      input.priority || 'medium'
    ]
  );
  return result.lastInsertRowId as number;
}

export async function fetchShoppingList(listId: number): Promise<ShoppingList | undefined> {
  const db = await initDatabase();
  return db.getFirstAsync<ShoppingList>(
    `SELECT * FROM shopping_lists WHERE id = ? LIMIT 1;`,
    [listId]
  );
}

export async function fetchShoppingListItems(listId: number): Promise<ShoppingListItemWithProduct[]> {
  const db = await initDatabase();
  return db.getAllAsync<ShoppingListItemWithProduct>(
    `SELECT
      sli.id,
      sli.list_id,
      sli.product_id,
      sli.name,
      sli.quantity_value,
      sli.quantity_label,
      sli.estimated_unit_cost,
      sli.notes,
      sli.is_completed,
      sli.created_at,
      p.name AS product_name,
      p.quantity AS product_quantity
    FROM shopping_list_items sli
    LEFT JOIN products p ON p.id = sli.product_id
    WHERE sli.list_id = ?
    ORDER BY sli.created_at DESC;`,
    [listId]
  );
}

export interface ShoppingListItemInput {
  listId: number;
  name: string;
  quantityValue?: number;
  quantityLabel?: string;
  estimatedUnitCost?: number;
}

export async function addShoppingListItem(input: ShoppingListItemInput) {
  const db = await initDatabase();
  await db.runAsync(
    `INSERT INTO shopping_list_items (list_id, name, quantity_value, quantity_label, estimated_unit_cost)
     VALUES (?, ?, ?, ?, ?);`,
    [
      input.listId,
      input.name.trim(),
      input.quantityValue ?? 1,
      input.quantityLabel || null,
      input.estimatedUnitCost ?? 0
    ]
  );
}

export async function toggleShoppingListItem(itemId: number, isCompleted: boolean) {
  const db = await initDatabase();
  await db.runAsync(
    `UPDATE shopping_list_items SET is_completed = ? WHERE id = ?;`,
    [isCompleted ? 1 : 0, itemId]
  );
}

export async function findUserByNickname(nickname: string): Promise<User | undefined> {
  const db = await initDatabase();
  return db.getFirstAsync<User>(
    `SELECT * FROM users WHERE LOWER(nickname) = LOWER(?) LIMIT 1;`,
    [nickname]
  );
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await initDatabase();
  return db.getFirstAsync<User>(
    `SELECT * FROM users WHERE id = ? LIMIT 1;`,
    [id]
  );
}

export async function createUser(nickname: string, password: string) {
  const db = await initDatabase();
  const hashed = hashPassword(password);
  await db.runAsync(
    `INSERT INTO users (nickname, password) VALUES (?, ?);`,
    [nickname.trim(), hashed]
  );
}
