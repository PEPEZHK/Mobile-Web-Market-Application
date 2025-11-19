import type { Database } from "sql.js";

export const UNASSIGNED_CUSTOMER_VALUE = "__unassigned__";

export interface ListDepotSyncResult {
  updatedProducts: number;
  totalQuantity: number;
}

export function syncListItemsToDepot(database: Database, listId: number): ListDepotSyncResult {
  const aggregated = database.exec(`
    SELECT product_id, SUM(quantity_value) as total_quantity
    FROM shopping_list_items
    WHERE list_id = ${listId} AND product_id IS NOT NULL
    GROUP BY product_id
  `);

  let updatedProducts = 0;
  let totalQuantity = 0;

  if (aggregated[0]) {
    aggregated[0].values.forEach(row => {
      const productId = row[0] as number | null;
      const quantity = Number(row[1] ?? 0);

      if (productId !== null && Number.isFinite(quantity) && quantity !== 0) {
        database.run("UPDATE products SET quantity = quantity + ? WHERE id = ?", [quantity, productId]);
        updatedProducts += 1;
        totalQuantity += quantity;
      }
    });
  }

  database.run(
    "UPDATE shopping_list_items SET is_completed = 1 WHERE list_id = ? AND is_completed = 0",
    [listId]
  );

  return { updatedProducts, totalQuantity };
}
