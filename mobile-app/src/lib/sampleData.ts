import type { Database } from "sql.js";

export interface SampleProduct {
  name: string;
  barcode: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  minStock: number;
}

export interface SampleCustomer {
  name: string;
  phone: string;
  notes: string;
}

export interface SampleTransactionItem {
  barcode: string;
  quantity: number;
  unitPrice: number;
}

export interface SampleTransaction {
  customerName: string;
  dateOffset: number;
  paymentStatus: "fully_paid" | "debt";
  items: SampleTransactionItem[];
}

export interface SampleShoppingListItem {
  productBarcode?: string;
  name: string;
  quantityValue: number;
  quantityLabel: string;
  estimatedUnitCost: number;
  notes: string;
}

export interface SampleShoppingList {
  title: string;
  type: "restock" | "customer_order";
  status: "active" | "completed" | "archived";
  priority: "low" | "medium" | "high";
  notes: string;
  customerName?: string;
  items: SampleShoppingListItem[];
}

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  { name: "Laptop HP ProBook", barcode: "LP001", category: "Electronics", buyPrice: 450.0, sellPrice: 650.0, quantity: 15, minStock: 3 },
  { name: "Wireless Mouse", barcode: "MS001", category: "Electronics", buyPrice: 8.0, sellPrice: 15.0, quantity: 60, minStock: 12 },
  { name: "USB-C Cable", barcode: "CB001", category: "Accessories", buyPrice: 3.0, sellPrice: 7.0, quantity: 120, minStock: 30 },
  { name: "Office Chair", barcode: "CH001", category: "Furniture", buyPrice: 80.0, sellPrice: 150.0, quantity: 10, minStock: 2 },
  { name: "Notebook A4", barcode: "NB001", category: "Stationery", buyPrice: 1.5, sellPrice: 3.5, quantity: 240, minStock: 40 },
  { name: "Mechanical Keyboard", barcode: "KB001", category: "Electronics", buyPrice: 55.0, sellPrice: 95.0, quantity: 25, minStock: 5 },
  { name: "27\" Monitor", barcode: "MN001", category: "Electronics", buyPrice: 180.0, sellPrice: 260.0, quantity: 18, minStock: 3 },
  { name: "External Hard Drive 1TB", barcode: "HD001", category: "Electronics", buyPrice: 45.0, sellPrice: 85.0, quantity: 35, minStock: 6 },
  { name: "Desk Lamp LED", barcode: "DL001", category: "Furniture", buyPrice: 12.0, sellPrice: 28.0, quantity: 40, minStock: 8 },
  { name: "Ergonomic Mouse Pad", barcode: "MP001", category: "Accessories", buyPrice: 2.5, sellPrice: 6.5, quantity: 70, minStock: 10 },
  { name: "Portable Speaker", barcode: "SP001", category: "Electronics", buyPrice: 30.0, sellPrice: 55.0, quantity: 28, minStock: 6 },
  { name: "Smartphone Charger", barcode: "CHG001", category: "Electronics", buyPrice: 4.5, sellPrice: 12.0, quantity: 100, minStock: 15 },
  { name: "HDMI Cable 2m", barcode: "HDMI001", category: "Accessories", buyPrice: 2.8, sellPrice: 9.0, quantity: 85, minStock: 18 },
  { name: "Whiteboard Markers", barcode: "WM001", category: "Stationery", buyPrice: 1.2, sellPrice: 4.0, quantity: 150, minStock: 25 },
  { name: "Desk Organizer Set", barcode: "DO001", category: "Stationery", buyPrice: 9.5, sellPrice: 22.0, quantity: 32, minStock: 6 },
  { name: "Wireless Router", barcode: "WR001", category: "Electronics", buyPrice: 35.0, sellPrice: 70.0, quantity: 22, minStock: 4 },
  { name: "Power Strip 6-Outlet", barcode: "PS001", category: "Electronics", buyPrice: 6.0, sellPrice: 14.0, quantity: 90, minStock: 20 },
  { name: "Graphic Tablet", barcode: "GT001", category: "Electronics", buyPrice: 120.0, sellPrice: 190.0, quantity: 12, minStock: 2 },
  { name: "Noise-Cancelling Headphones", barcode: "HP001", category: "Electronics", buyPrice: 95.0, sellPrice: 165.0, quantity: 16, minStock: 3 },
  { name: "Standing Desk Converter", barcode: "SDC001", category: "Furniture", buyPrice: 120.0, sellPrice: 200.0, quantity: 14, minStock: 2 },
];

export const SAMPLE_CUSTOMERS: SampleCustomer[] = [
  { name: "Tech Solutions Ltd", phone: "+1234567890", notes: "Regular corporate client" },
  { name: "Small Office Co", phone: "+0987654321", notes: "Monthly orders" },
  { name: "Bright Future Agency", phone: "+1300456789", notes: "Marketing materials and office electronics" },
  { name: "Greenfield Architects", phone: "+1400555123", notes: "Workstations and drafting accessories" },
  { name: "Horizon Marketing", phone: "+1500666789", notes: "Event equipment rentals" },
  { name: "NextGen Startups", phone: "+1600777345", notes: "Bulk electronics purchases quarterly" },
  { name: "Sunrise Studios", phone: "+1700888123", notes: "Audio gear and desk accessories" },
  { name: "Metro Logistics", phone: "+1800999456", notes: "Warehouse office supplies" },
];

export const SAMPLE_TRANSACTIONS: SampleTransaction[] = [
  {
    customerName: "Tech Solutions Ltd",
    dateOffset: -7,
    paymentStatus: "fully_paid",
    items: [
      { barcode: "MS001", quantity: 5, unitPrice: 15.0 },
      { barcode: "CB001", quantity: 10, unitPrice: 7.0 },
      { barcode: "HD001", quantity: 2, unitPrice: 85.0 },
    ],
  },
  {
    customerName: "Small Office Co",
    dateOffset: -5,
    paymentStatus: "debt",
    items: [
      { barcode: "NB001", quantity: 60, unitPrice: 3.5 },
      { barcode: "WM001", quantity: 20, unitPrice: 4.0 },
      { barcode: "DO001", quantity: 5, unitPrice: 22.0 },
    ],
  },
  {
    customerName: "Greenfield Architects",
    dateOffset: -3,
    paymentStatus: "fully_paid",
    items: [
      { barcode: "MN001", quantity: 4, unitPrice: 260.0 },
      { barcode: "CH001", quantity: 6, unitPrice: 150.0 },
      { barcode: "GT001", quantity: 1, unitPrice: 190.0 },
    ],
  },
  {
    customerName: "Horizon Marketing",
    dateOffset: -2,
    paymentStatus: "fully_paid",
    items: [
      { barcode: "SP001", quantity: 6, unitPrice: 55.0 },
      { barcode: "HP001", quantity: 3, unitPrice: 165.0 },
      { barcode: "DL001", quantity: 10, unitPrice: 28.0 },
    ],
  },
  {
    customerName: "Sunrise Studios",
    dateOffset: -1,
    paymentStatus: "fully_paid",
    items: [
      { barcode: "WR001", quantity: 3, unitPrice: 70.0 },
      { barcode: "PS001", quantity: 12, unitPrice: 14.0 },
      { barcode: "HP001", quantity: 2, unitPrice: 165.0 },
    ],
  },
];

export const SAMPLE_SHOPPING_LISTS: SampleShoppingList[] = [
  {
    title: "Weekly Restock",
    type: "restock",
    status: "active",
    priority: "high",
    notes: "Example restock plan showcasing the new shopping list workflow.",
    items: [
      { productBarcode: "CB001", name: "USB-C Cable", quantityValue: 25, quantityLabel: "pcs", estimatedUnitCost: 3.0, notes: "Reorder before next shipment" },
      { name: "Packaging Boxes", quantityValue: 50, quantityLabel: "units", estimatedUnitCost: 0.5, notes: "Needed for order packing" },
    ],
  },
  {
    title: "Order for Tech Solutions",
    type: "customer_order",
    status: "active",
    priority: "medium",
    notes: "Items requested by Tech Solutions Ltd that are currently out of stock.",
    customerName: "Tech Solutions Ltd",
    items: [
      { productBarcode: "LP001", name: "Laptop HP ProBook", quantityValue: 2, quantityLabel: "pcs", estimatedUnitCost: 450.0, notes: "Fulfil customer special order" },
      { name: "Wireless Keyboard", quantityValue: 3, quantityLabel: "pcs", estimatedUnitCost: 28.0, notes: "Source from external supplier" },
    ],
  },
];

function recordExists(database: Database, query: string, params: (string | number | null)[] = []): boolean {
  const stmt = database.prepare(query);
  try {
    stmt.bind(params);
    return stmt.step();
  } finally {
    stmt.free();
  }
}

export function seedSampleData(database: Database): boolean {
  let mutated = false;

  SAMPLE_PRODUCTS.forEach((product) => {
    const exists = recordExists(
      database,
      `SELECT 1 FROM products WHERE barcode = ? LIMIT 1`,
      [product.barcode],
    );

    if (!exists) {
      database.run(
        `INSERT INTO products (name, barcode, category, buy_price, sell_price, quantity, min_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          product.name,
          product.barcode,
          product.category,
          product.buyPrice,
          product.sellPrice,
          product.quantity,
          product.minStock,
        ],
      );
      mutated = true;
    }
  });

  const productRows = database.exec("SELECT id, barcode FROM products");
  const productIdByBarcode = new Map<string, number>();
  productRows[0]?.values.forEach((row) => {
    const [id, barcode] = row as [number, string];
    productIdByBarcode.set(barcode, id);
  });

  SAMPLE_CUSTOMERS.forEach((customer) => {
    const exists = recordExists(
      database,
      `SELECT 1 FROM customers WHERE name = ? LIMIT 1`,
      [customer.name],
    );

    if (!exists) {
      database.run(
        `INSERT INTO customers (name, phone, notes)
         VALUES (?, ?, ?)`,
        [customer.name, customer.phone, customer.notes],
      );
      mutated = true;
    }
  });

  const customerRows = database.exec("SELECT id, name FROM customers");
  const customerIdByName = new Map<string, number>();
  customerRows[0]?.values.forEach((row) => {
    const [id, name] = row as [number, string];
    customerIdByName.set(name, id);
  });

  const hasTransactions = recordExists(database, "SELECT 1 FROM transactions LIMIT 1");

  if (!hasTransactions) {
    SAMPLE_TRANSACTIONS.forEach((transaction) => {
      const customerId = customerIdByName.get(transaction.customerName) ?? null;
      const totalAmount = transaction.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const paidAmount = transaction.paymentStatus === "fully_paid" ? totalAmount : 0;

      database.run(
        `INSERT INTO transactions (customer_id, total_amount, date, payment_status, paid_amount)
         VALUES (?, ?, datetime('now', ?), ?, ?)`,
        [customerId, totalAmount, `${transaction.dateOffset} days`, transaction.paymentStatus, paidAmount],
      );

      const txIdResult = database.exec("SELECT last_insert_rowid() as id");
      const insertedTransactionId = txIdResult[0]?.values?.[0]?.[0] as number | undefined;

      if (!insertedTransactionId) {
        return;
      }

      transaction.items.forEach((item) => {
        const productId = productIdByBarcode.get(item.barcode);
        if (!productId) {
          return;
        }

        const lineTotal = item.unitPrice * item.quantity;

        database.run(
          `INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?)`,
          [insertedTransactionId, productId, item.quantity, item.unitPrice, lineTotal],
        );

        database.run(
          "UPDATE products SET quantity = quantity - ? WHERE id = ?",
          [item.quantity, productId],
        );
      });
    });

    if (SAMPLE_TRANSACTIONS.length > 0) {
      mutated = true;
    }
  }

  SAMPLE_SHOPPING_LISTS.forEach((list) => {
    const exists = recordExists(
      database,
      `SELECT 1 FROM shopping_lists WHERE title = ? LIMIT 1`,
      [list.title],
    );

    if (exists) {
      return;
    }

    const customerId = list.customerName ? customerIdByName.get(list.customerName) ?? null : null;

    database.run(
      `INSERT INTO shopping_lists (title, type, status, priority, notes, customer_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [list.title, list.type, list.status, list.priority, list.notes, customerId],
    );

    const resultList = database.exec("SELECT last_insert_rowid() as id");
    const listId = resultList[0]?.values?.[0]?.[0] as number | undefined;

    if (!listId) {
      return;
    }

    list.items.forEach((item) => {
      const productId = item.productBarcode ? productIdByBarcode.get(item.productBarcode) ?? null : null;

      database.run(
        `INSERT INTO shopping_list_items (list_id, product_id, name, quantity_value, quantity_label, estimated_unit_cost, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          listId,
          productId,
          item.name,
          item.quantityValue,
          item.quantityLabel,
          item.estimatedUnitCost,
          item.notes,
        ],
      );
    });

    mutated = true;
  });

  return mutated;
}
