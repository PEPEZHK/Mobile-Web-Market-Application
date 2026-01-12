import type { Database } from "sql.js";
export const UNASSIGNED_CUSTOMER_VALUE = "__unassigned__";
export const MONTHLY_RESTOCK_TYPE = "monthly_restock";

export interface ListDepotSyncResult {
  updatedProducts: number;
  totalQuantity: number;
  transferId?: number;
}

export function ensureMonthlyRestockList(database: Database): number {
  const existing = database.exec(
    "SELECT id FROM shopping_lists WHERE type = ? LIMIT 1",
    [MONTHLY_RESTOCK_TYPE]
  );

  if (existing[0]?.values?.length) {
    return existing[0].values[0][0] as number;
  }

  database.run(
    `INSERT INTO shopping_lists (title, type, status, priority, notes)
     VALUES (?, ?, 'active', 'high', ?)`,
    [
      "Monthly Restock",
      MONTHLY_RESTOCK_TYPE,
      "Automatically created monthly restock list"
    ]
  );

  const inserted = database.exec("SELECT last_insert_rowid()");
  return inserted[0]?.values?.[0]?.[0] as number;
}

export function syncMonthlyRestockFromDepot(database: Database): number {
  const listId = ensureMonthlyRestockList(database);
  database.run("UPDATE shopping_lists SET status = 'active' WHERE id = ?", [listId]);

  const productsResult = database.exec(`
    SELECT id, name, buy_price, sell_price, category, quantity, min_stock
    FROM products
    WHERE quantity <= 1
    ORDER BY name ASC
  `);

  const lowStockProducts = productsResult[0]
    ? productsResult[0].values.map(row => ({
        id: row[0] as number,
        name: row[1] as string,
        buy_price: Number(row[2] ?? 0),
        sell_price: Number(row[3] ?? 0),
        category: row[4] ? (row[4] as string) : null,
        quantity: Number(row[5] ?? 0),
        min_stock: Number(row[6] ?? 0)
      }))
    : [];

  const lowStockIds = lowStockProducts.map(product => product.id);
  if (lowStockIds.length === 0) {
    database.run(
      "DELETE FROM shopping_list_items WHERE list_id = ? AND product_id IS NOT NULL",
      [listId]
    );
    return listId;
  }

  const placeholders = lowStockIds.map(() => "?").join(", ");
  database.run(
    `DELETE FROM shopping_list_items
     WHERE list_id = ? AND product_id IS NOT NULL AND product_id NOT IN (${placeholders})`,
    [listId, ...lowStockIds]
  );

  lowStockProducts.forEach(product => {
    const restockQuantity = Math.max(1, product.min_stock - product.quantity);
    const existing = database.exec(
      "SELECT id, quantity_value FROM shopping_list_items WHERE list_id = ? AND product_id = ? LIMIT 1",
      [listId, product.id]
    );

    if (existing[0]?.values?.length) {
      const itemId = existing[0].values[0][0] as number;
      const currentQuantity = Number(existing[0].values[0][1] ?? 0);
      const nextQuantity = Number.isFinite(currentQuantity) && currentQuantity > 0
        ? currentQuantity
        : restockQuantity;
      database.run(
        `UPDATE shopping_list_items
         SET quantity_value = ?, estimated_unit_cost = ?, sell_price = ?, category = ?, name = ?, is_completed = 0
         WHERE id = ?`,
        [
          nextQuantity,
          product.buy_price,
          product.sell_price,
          product.category,
          product.name,
          itemId
        ]
      );
    } else {
      database.run(
        `INSERT INTO shopping_list_items (list_id, product_id, name, quantity_value, estimated_unit_cost, sell_price, category, is_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          listId,
          product.id,
          product.name,
          restockQuantity,
          product.buy_price,
          product.sell_price,
          product.category
        ]
      );
    }
  });

  return listId;
}

export function syncListItemsToDepot(database: Database, listId: number): ListDepotSyncResult {
  let updatedProducts = 0;
  let totalQuantity = 0;
  const transferItems: Array<{ productId: number; quantity: number }> = [];

  const listInfo = database.exec(
    "SELECT title, type FROM shopping_lists WHERE id = ? LIMIT 1",
    [listId]
  );
  const listTitle = listInfo[0]?.values?.[0]?.[0] as string | undefined;
  const listType = listInfo[0]?.values?.[0]?.[1] as string | undefined;
  const fallbackCategory =
    listTitle?.trim() ||
    (listType === "customer_order" ? "Customer Order" : "Shopping List");

  // Pull all list items to handle both linked and unlinked products.
  const items = database.exec(`
    SELECT id, product_id, name, quantity_value, quantity_label, estimated_unit_cost, sell_price, category
    FROM shopping_list_items
    WHERE list_id = ?
  `, [listId]);

  const parseQuantity = (rawValue: unknown, rawLabel: unknown) => {
    const valueNumber = Number(rawValue);
    if (Number.isFinite(valueNumber) && valueNumber !== 0) return valueNumber;
    const labelNumber = typeof rawLabel === 'string' ? parseFloat(rawLabel) : NaN;
    if (Number.isFinite(labelNumber) && labelNumber !== 0) return labelNumber;
    return 0;
  };

  if (items[0]) {
    items[0].values.forEach(row => {
      const itemId = row[0] as number;
      const productId = row[1] as number | null;
      const name = row[2] as string;
      const quantity = parseQuantity(row[3], row[4]);
      const estimatedUnitCost = Number(row[5] ?? 0);
      const sellPrice = Number(row[6] ?? 0);
      const category = (row[7] as string | null)?.trim() || null;

      if (!Number.isFinite(quantity) || quantity === 0) {
        return;
      }

      if (productId !== null) {
        database.run("UPDATE products SET quantity = quantity + ? WHERE id = ?", [quantity, productId]);
        transferItems.push({ productId, quantity });
        updatedProducts += 1;
        totalQuantity += quantity;
      } else {
        database.run(
          `INSERT INTO products (name, buy_price, sell_price, quantity, min_stock, category, barcode)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            name,
            estimatedUnitCost > 0 ? estimatedUnitCost : 0,
            sellPrice > 0 ? sellPrice : estimatedUnitCost > 0 ? estimatedUnitCost : 0,
            quantity,
            0,
            category || fallbackCategory,
            null
          ]
        );
        const newIdResult = database.exec("SELECT last_insert_rowid()");
        const newProductId = newIdResult[0]?.values?.[0]?.[0] as number | undefined;
        if (newProductId) {
          database.run("UPDATE shopping_list_items SET product_id = ? WHERE id = ?", [newProductId, itemId]);
          transferItems.push({ productId: newProductId, quantity });
          updatedProducts += 1;
          totalQuantity += quantity;
        }
      }
    });
  }

  let transferId: number | undefined;
  if (transferItems.length > 0) {
    database.run(
      "INSERT INTO shopping_list_transfers (list_id) VALUES (?)",
      [listId]
    );
    const transferResult = database.exec("SELECT last_insert_rowid()");
    transferId = transferResult[0]?.values?.[0]?.[0] as number | undefined;

    if (transferId) {
      transferItems.forEach(item => {
        database.run(
          `INSERT INTO shopping_list_transfer_items (transfer_id, product_id, quantity)
           VALUES (?, ?, ?)` ,
          [transferId, item.productId, item.quantity]
        );
      });
    }
  }

  database.run(
    "UPDATE shopping_list_items SET is_completed = 1 WHERE list_id = ? AND is_completed = 0",
    [listId]
  );

  return { updatedProducts, totalQuantity, transferId };
}

export function transferMonthlyRestock(database: Database, listId?: number): ListDepotSyncResult {
  const targetListId = listId ?? syncMonthlyRestockFromDepot(database);
  const result = syncListItemsToDepot(database, targetListId);
  syncMonthlyRestockFromDepot(database);
  return result;
}

export interface ListRollbackResult {
  status: "success" | "no_backup" | "missing_products" | "insufficient_stock";
  updatedProducts: number;
  totalQuantity: number;
  missingProducts: number;
  insufficientProducts: number;
}

export function rollbackLatestListTransfer(database: Database, listId: number): ListRollbackResult {
  const transferResult = database.exec(
    `SELECT id
     FROM shopping_list_transfers
     WHERE list_id = ? AND reverted_at IS NULL
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT 1`,
    [listId]
  );

  if (!transferResult[0]?.values?.length) {
    return {
      status: "no_backup",
      updatedProducts: 0,
      totalQuantity: 0,
      missingProducts: 0,
      insufficientProducts: 0
    };
  }

  const transferId = transferResult[0].values[0][0] as number;
  const itemsResult = database.exec(
    "SELECT product_id, quantity FROM shopping_list_transfer_items WHERE transfer_id = ?",
    [transferId]
  );

  if (!itemsResult[0]?.values?.length) {
    return {
      status: "no_backup",
      updatedProducts: 0,
      totalQuantity: 0,
      missingProducts: 0,
      insufficientProducts: 0
    };
  }

  let missingProducts = 0;
  let insufficientProducts = 0;
  const transferItems = itemsResult[0].values.map(row => ({
    productId: row[0] as number,
    quantity: Number(row[1] ?? 0)
  }));

  transferItems.forEach(item => {
    const productResult = database.exec(
      "SELECT quantity FROM products WHERE id = ? LIMIT 1",
      [item.productId]
    );
    if (!productResult[0]?.values?.length) {
      missingProducts += 1;
      return;
    }
    const currentQuantity = Number(productResult[0].values[0][0] ?? 0);
    if (!Number.isFinite(currentQuantity) || currentQuantity < item.quantity) {
      insufficientProducts += 1;
    }
  });

  if (missingProducts > 0) {
    return {
      status: "missing_products",
      updatedProducts: 0,
      totalQuantity: 0,
      missingProducts,
      insufficientProducts
    };
  }

  if (insufficientProducts > 0) {
    return {
      status: "insufficient_stock",
      updatedProducts: 0,
      totalQuantity: 0,
      missingProducts,
      insufficientProducts
    };
  }

  let totalQuantity = 0;
  transferItems.forEach(item => {
    if (!Number.isFinite(item.quantity) || item.quantity === 0) {
      return;
    }
    database.run(
      "UPDATE products SET quantity = quantity - ? WHERE id = ?",
      [item.quantity, item.productId]
    );
    totalQuantity += item.quantity;
  });

  database.run("UPDATE shopping_list_items SET is_completed = 0 WHERE list_id = ?", [listId]);
  database.run("UPDATE shopping_lists SET status = 'active' WHERE id = ?", [listId]);
  database.run("UPDATE shopping_list_transfers SET reverted_at = CURRENT_TIMESTAMP WHERE id = ?", [transferId]);

  return {
    status: "success",
    updatedProducts: transferItems.length,
    totalQuantity,
    missingProducts: 0,
    insufficientProducts: 0
  };
}
