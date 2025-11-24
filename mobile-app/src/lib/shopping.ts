import type { Database } from "sql.js";

export const UNASSIGNED_CUSTOMER_VALUE = "__unassigned__";

export interface ListDepotSyncResult {
  updatedProducts: number;
  totalQuantity: number;
}

export function syncListItemsToDepot(database: Database, listId: number): ListDepotSyncResult {
  let updatedProducts = 0;
  let totalQuantity = 0;

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
          updatedProducts += 1;
          totalQuantity += quantity;
        }
      }
    });
  }

  database.run(
    "UPDATE shopping_list_items SET is_completed = 1 WHERE list_id = ? AND is_completed = 0",
    [listId]
  );

  return { updatedProducts, totalQuantity };
}
