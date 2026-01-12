import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { exportSheetsAsExcel } from "@/lib/export-excel";
import { getDatabase, saveDatabase } from "@/lib/db";
import {
  ensureMonthlyRestockList,
  MONTHLY_RESTOCK_TYPE,
  rollbackLatestListTransfer,
  syncListItemsToDepot,
  syncMonthlyRestockFromDepot,
  transferMonthlyRestock,
  UNASSIGNED_CUSTOMER_VALUE
} from "@/lib/shopping";
import {
  Customer,
  Product,
  ShoppingList,
  ShoppingListItemWithProduct,
  ShoppingListWithStats
} from "@/types";
import {
  ArrowLeft,
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { formatCurrency } from "@/lib/utils";

interface ItemFormState {
  name: string;
  productId: string;
  quantityValue: string;
  quantityLabel: string;
  estimatedUnitCost: string;
  sellPrice: string;
  category: string;
  notes: string;
}

interface ListFormState {
  title: string;
  type: ShoppingList["type"];
  status: ShoppingList["status"];
  priority: ShoppingList["priority"];
  customerId: string;
  dueDate: string;
  notes: string;
}

const defaultItemForm: ItemFormState = {
  name: "",
  productId: "",
  quantityValue: "1",
  quantityLabel: "",
  estimatedUnitCost: "0",
  sellPrice: "0",
  category: "",
  notes: ""
};

const defaultListForm: ListFormState = {
  title: "",
  type: "restock",
  status: "active",
  priority: "medium",
  customerId: "",
  dueDate: "",
  notes: ""
};

function formatMoney(value: number): string {
  return formatCurrency(value);
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, (month ?? 1) - 1, day);
    return date.toLocaleDateString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const noSpaces = trimmed.replace(/\s+/g, "").replace(/'/g, "");
  const lastComma = noSpaces.lastIndexOf(",");
  const lastDot = noSpaces.lastIndexOf(".");
  let normalized = noSpaces;

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = noSpaces.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = noSpaces.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    const digitsAfter = noSpaces.length - lastComma - 1;
    normalized = digitsAfter === 3 ? noSpaces.replace(/,/g, "") : noSpaces.replace(/,/g, ".");
  } else if (lastDot > -1) {
    const digitsAfter = noSpaces.length - lastDot - 1;
    if (digitsAfter === 3) {
      normalized = noSpaces.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function priorityVariant(priority: ShoppingList["priority"]): "outline" | "default" | "destructive" {
  if (priority === "high") return "destructive";
  if (priority === "medium") return "default";
  return "outline";
}

export default function ShoppingListDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const listId = Number(id);

  const [list, setList] = useState<ShoppingListWithStats | null>(null);
  const [items, setItems] = useState<ShoppingListItemWithProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const categoryOptions = useMemo(() => {
    const unique = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        unique.add(p.category.trim());
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(defaultItemForm);

  const [isListDialogOpen, setIsListDialogOpen] = useState(false);
  const [listForm, setListForm] = useState<ListFormState>(defaultListForm);
  const { t } = useTranslation();
  const isMonthlyRestock = list?.type === MONTHLY_RESTOCK_TYPE;

  const listTypeLabel = (type: ShoppingList["type"]): string => {
    if (type === "customer_order") return t("shopping.type.customerOrder");
    if (type === MONTHLY_RESTOCK_TYPE) return t("shopping.type.monthlyRestock", { defaultValue: "Monthly restock" });
    return t("shopping.type.restock");
  };

  const statusLabel = (status: ShoppingList["status"]): string => {
    switch (status) {
      case "completed":
        return t("shopping.status.completed");
      case "archived":
        return t("shopping.status.archived");
      default:
        return t("shopping.status.active");
    }
  };

  const priorityLabel = (priority: ShoppingList["priority"]): string => {
    switch (priority) {
      case "high":
        return t("shopping.priority.high");
      case "low":
        return t("shopping.priority.low");
      default:
        return t("shopping.priority.medium");
    }
  };

  useEffect(() => {
    if (!Number.isFinite(listId)) {
      return;
    }
    loadList(listId);
    loadItems(listId);
    loadCustomers();
    loadProducts();
  }, [listId]);

  const pendingItems = useMemo(
    () => items.filter(item =>
      item.is_completed === 0 &&
      (!isMonthlyRestock || item.quantity_value > 0)
    ),
    [items, isMonthlyRestock]
  );

  const completedItems = useMemo(
    () => items.filter(item =>
      item.is_completed === 1 &&
      (!isMonthlyRestock || item.quantity_value > 0)
    ),
    [items, isMonthlyRestock]
  );

  const totalEstimatedCost = useMemo(() => {
    return items.reduce((total, item) => {
      const unitCost = item.estimated_unit_cost > 0
        ? item.estimated_unit_cost
        : item.product_buy_price ?? 0;
      return total + item.quantity_value * unitCost;
    }, 0);
  }, [items]);

  const pendingEstimatedCost = useMemo(() => {
    return pendingItems.reduce((total, item) => {
      const unitCost = item.estimated_unit_cost > 0
        ? item.estimated_unit_cost
        : item.product_buy_price ?? 0;
      return total + item.quantity_value * unitCost;
    }, 0);
  }, [pendingItems]);

  const progressValue = useMemo(() => {
    const totalItems = (list?.pending_count ?? 0) + (list?.completed_count ?? 0);
    if (totalItems === 0) return 0;
    return Math.round(((list?.completed_count ?? 0) / totalItems) * 100);
  }, [list]);

  const handleListDialogOpenChange = (open: boolean) => {
    setIsListDialogOpen(open);
    if (!open) {
      setListForm(defaultListForm);
    }
  };

  const handleItemDialogOpenChange = (open: boolean) => {
    setIsItemDialogOpen(open);
    if (!open) {
      setItemForm(defaultItemForm);
      setEditingItemId(null);
    }
  };

  const loadList = (targetListId: number) => {
    const db = getDatabase();
    const monthlyListId = ensureMonthlyRestockList(db);
    if (monthlyListId === targetListId) {
      syncMonthlyRestockFromDepot(db);
      saveDatabase();
    }
    const result = db.exec(`
      SELECT l.id, l.title, l.type, l.status, l.priority, l.notes, l.customer_id, c.name, l.due_date, l.created_at,
        SUM(CASE WHEN li.is_completed = 0 THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN li.is_completed = 1 THEN 1 ELSE 0 END) as completed_count,
        SUM(li.quantity_value * COALESCE(NULLIF(li.estimated_unit_cost, 0), p.buy_price, 0)) as estimated_total,
        SUM(CASE WHEN li.is_completed = 0 THEN li.quantity_value * COALESCE(NULLIF(li.estimated_unit_cost, 0), p.buy_price, 0) ELSE 0 END) as pending_estimated_total
      FROM shopping_lists l
      LEFT JOIN customers c ON c.id = l.customer_id
      LEFT JOIN shopping_list_items li ON li.list_id = l.id
      LEFT JOIN products p ON p.id = li.product_id
      WHERE l.id = ${targetListId}
      GROUP BY l.id
    `);

    if (!result[0] || result[0].values.length === 0) {
      setList(null);
      return;
    }

    const backupResult = db.exec(
      `SELECT COUNT(*) FROM shopping_list_transfers WHERE list_id = ? AND reverted_at IS NULL`,
      [targetListId]
    );
    const hasBackup = Number(backupResult[0]?.values?.[0]?.[0] ?? 0) > 0;

    const row = result[0].values[0];
    setList({
      id: row[0] as number,
      title: row[1] as string,
      type: (row[2] as ShoppingList["type"]) ?? "restock",
      status: (row[3] as ShoppingList["status"]) ?? "active",
      priority: (row[4] as ShoppingList["priority"]) ?? "medium",
      notes: row[5] ? (row[5] as string) : null,
      customer_id: row[6] === null ? null : (row[6] as number),
      customer_name: row[7] ? (row[7] as string) : null,
      due_date: row[8] ? (row[8] as string) : null,
      created_at: row[9] as string,
      pending_count: Number(row[10] ?? 0),
      completed_count: Number(row[11] ?? 0),
      estimated_total: Number(row[12] ?? 0),
      pending_estimated_total: Number(row[13] ?? 0),
      has_backup: hasBackup
    });
  };

  const loadItems = (targetListId: number) => {
    const db = getDatabase();
    const result = db.exec(`
      SELECT li.id, li.list_id, li.product_id, li.name, li.quantity_value, li.quantity_label, li.estimated_unit_cost, li.sell_price, li.category, li.notes, li.is_completed, li.created_at,
             p.name, p.buy_price, p.sell_price, p.quantity, p.category
      FROM shopping_list_items li
      LEFT JOIN products p ON p.id = li.product_id
      WHERE li.list_id = ${targetListId}
      ORDER BY li.is_completed ASC, datetime(li.created_at) DESC
    `);

    if (result[0]) {
      const loadedItems: ShoppingListItemWithProduct[] = result[0].values.map(row => ({
        id: row[0] as number,
        list_id: row[1] as number,
        product_id: row[2] === null ? null : (row[2] as number),
        name: row[3] as string,
        quantity_value: Number(row[4] ?? 1),
        quantity_label: row[5] ? (row[5] as string) : null,
        estimated_unit_cost: Number(row[6] ?? 0),
        sell_price: Number(row[7] ?? 0),
        category: row[8] ? (row[8] as string) : null,
        notes: row[9] ? (row[9] as string) : null,
        is_completed: row[10] as number,
        created_at: row[11] as string,
        product_name: row[12] ? (row[12] as string) : null,
        product_buy_price: row[13] === null ? null : Number(row[13]),
        product_sell_price: row[14] === null ? null : Number(row[14]),
        product_quantity: row[15] === null ? null : Number(row[15]),
        product_category: row[16] ? (row[16] as string) : null
      }));
      setItems(loadedItems);
    } else {
      setItems([]);
    }
  };

  const loadCustomers = () => {
    const db = getDatabase();
    const result = db.exec(`
      SELECT id, name, phone, notes, created_at
      FROM customers
      ORDER BY name ASC
    `);

    if (result[0]) {
      const loadedCustomers: Customer[] = result[0].values.map(row => ({
        id: row[0] as number,
        name: row[1] as string,
        phone: row[2] as string,
        notes: row[3] as string,
        created_at: row[4] as string
      }));
      setCustomers(loadedCustomers);
    }
  };

  const loadProducts = () => {
    const db = getDatabase();
    const result = db.exec(`
      SELECT id, name, barcode, category, buy_price, sell_price, quantity, min_stock, created_at
      FROM products
      ORDER BY name ASC
    `);

    if (result[0]) {
      const loadedProducts: Product[] = result[0].values.map(row => ({
        id: row[0] as number,
        name: row[1] as string,
        barcode: row[2] as string,
        category: row[3] as string,
        buy_price: Number(row[4] ?? 0),
        sell_price: Number(row[5] ?? 0),
        quantity: Number(row[6] ?? 0),
        min_stock: Number(row[7] ?? 0),
        created_at: row[8] as string
      }));
      setProducts(loadedProducts);
    }
  };

  const handleItemFormChange = (field: keyof ItemFormState, value: string) => {
    setItemForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleProductSelect = (value: string) => {
    if (value === "custom") {
      setItemForm(prev => ({ ...prev, productId: "" }));
      return;
    }

    const product = products.find(p => String(p.id) === value);
    setItemForm(prev => ({
      ...prev,
      productId: value,
      name: product ? product.name : prev.name,
      estimatedUnitCost: product ? String(product.buy_price ?? 0) : prev.estimatedUnitCost,
      sellPrice: product ? String(product.sell_price ?? 0) : prev.sellPrice,
      category: product?.category || prev.category
    }));
  };

  const handleSubmitItem = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!list) {
      toast.error(t("shopping.detail.toast.listMissing"));
      return;
    }

    if (!itemForm.name.trim()) {
      toast.error(t("shopping.detail.toast.itemNameRequired"));
      return;
    }

    const db = getDatabase();
    const quantityParsed = parseNumberInput(itemForm.quantityValue);
    if (quantityParsed === null) {
      toast.error(t("shopping.detail.toast.itemQuantityRequired", { defaultValue: "Enter a valid quantity." }));
      return;
    }
    const quantityValue = quantityParsed;
    const estimatedUnitCost = parseNumberInput(itemForm.estimatedUnitCost) ?? 0;
    const sellPriceValue = parseNumberInput(itemForm.sellPrice) ?? 0;
    const categoryValue = itemForm.category.trim() || null;
    const productId = itemForm.productId ? Number(itemForm.productId) : null;

    try {
      if (editingItemId) {
        db.run(
          `UPDATE shopping_list_items
           SET product_id = ?, name = ?, quantity_value = ?, quantity_label = ?, estimated_unit_cost = ?, sell_price = ?, category = ?, notes = ?
           WHERE id = ?`,
          [
            productId,
            itemForm.name.trim(),
            quantityValue,
            itemForm.quantityLabel.trim() || null,
            estimatedUnitCost,
            sellPriceValue,
            categoryValue,
            itemForm.notes.trim() || null,
            editingItemId
          ]
        );
        toast.success(t("shopping.detail.toast.itemUpdated"));
      } else {
        db.run(
          `INSERT INTO shopping_list_items (list_id, product_id, name, quantity_value, quantity_label, estimated_unit_cost, sell_price, category, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            list.id,
            productId,
            itemForm.name.trim(),
            quantityValue,
            itemForm.quantityLabel.trim() || null,
            estimatedUnitCost,
            sellPriceValue,
            categoryValue,
            itemForm.notes.trim() || null
          ]
        );
        toast.success(t("shopping.detail.toast.itemCreated"));
      }

      saveDatabase();
      loadItems(list.id);
      loadList(list.id);
      handleItemDialogOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(t("shopping.detail.toast.itemSaveError"));
    }
  };

  const handleDeleteItem = (item: ShoppingListItemWithProduct) => {
    const confirmed = window.confirm(
      t("shopping.detail.confirm.deleteItem", { values: { name: item.name } })
    );
    if (!confirmed) return;

    const db = getDatabase();
    db.run("DELETE FROM shopping_list_items WHERE id = ?", [item.id]);
    saveDatabase();
    toast.success(t("shopping.detail.toast.itemDeleted"));
    loadItems(item.list_id);
    loadList(item.list_id);
  };

  const handleToggleCompleted = (item: ShoppingListItemWithProduct) => {
    const db = getDatabase();
    const nextValue = item.is_completed === 1 ? 0 : 1;
    db.run("UPDATE shopping_list_items SET is_completed = ? WHERE id = ?", [nextValue, item.id]);
    saveDatabase();
    loadItems(item.list_id);
    loadList(item.list_id);
  };

  const handleSubmitList = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!list) {
      toast.error(t("shopping.detail.toast.listMissing"));
      return;
    }
    if (!listForm.title.trim()) {
      toast.error(t("shopping.form.validation.title"));
      return;
    }

    const db = getDatabase();
    const customerId = listForm.customerId ? Number(listForm.customerId) : null;
    const dueDateValue = listForm.dueDate.trim() || null;

    try {
      db.run(
        `UPDATE shopping_lists
         SET title = ?, type = ?, status = ?, priority = ?, notes = ?, customer_id = ?, due_date = ?
         WHERE id = ?`,
        [
          listForm.title.trim(),
          listForm.type,
          listForm.status,
          listForm.priority,
          listForm.notes.trim() || null,
          customerId,
          dueDateValue,
          list.id
        ]
      );
        toast.success(t("shopping.toast.listUpdated"));
      saveDatabase();
      handleListDialogOpenChange(false);
      loadList(list.id);
    } catch (error) {
      console.error(error);
      toast.error(t("shopping.detail.toast.listSaveError"));
    }
  };

  const handleEditList = () => {
    if (!list) return;
    setListForm({
      title: list.title,
      type: list.type,
      status: list.status,
      priority: list.priority,
      customerId: list.customer_id ? String(list.customer_id) : "",
      dueDate: list.due_date ? list.due_date.slice(0, 10) : "",
      notes: list.notes ?? ""
    });
    setIsListDialogOpen(true);
  };

  const handleDeleteList = () => {
    if (!list) return;
    if (isMonthlyRestock) {
      toast.error(t("shopping.detail.monthly.noDelete", { defaultValue: "Monthly restock list cannot be deleted." }));
      return;
    }
    const confirmed = window.confirm(
      t("shopping.confirm.deleteList", { values: { title: list.title } })
    );
    if (!confirmed) return;

    const db = getDatabase();
    db.run("DELETE FROM shopping_list_items WHERE list_id = ?", [list.id]);
    db.run("DELETE FROM shopping_lists WHERE id = ?", [list.id]);
    saveDatabase();
    toast.success(t("shopping.toast.listDeleted"));
    navigate("/shopping-list");
  };

  const handleToggleListStatus = () => {
    if (!list) return;
    const db = getDatabase();

    if (isMonthlyRestock) {
      const transferResult = transferMonthlyRestock(db, list.id);
      saveDatabase();
      toast.success(
        t("shopping.toast.itemsTransferred", {
          values: { count: transferResult.updatedProducts || transferResult.totalQuantity }
        })
      );
      loadItems(list.id);
      loadList(list.id);
      return;
    }

    const nextStatus = list.status === "completed" ? "active" : "completed";
    let transferResult: ReturnType<typeof syncListItemsToDepot> | null = null;

    if (nextStatus === "completed") {
      transferResult = syncListItemsToDepot(db, list.id);
    }

    db.run("UPDATE shopping_lists SET status = ? WHERE id = ?", [nextStatus, list.id]);
    saveDatabase();

    if (nextStatus === "completed") {
      if (transferResult && transferResult.updatedProducts > 0) {
        toast.success(
          t("shopping.toast.itemsTransferred", {
            values: { count: transferResult.updatedProducts }
          })
        );
      }
      toast.success(t("shopping.toast.listCompleted"));
    } else {
      toast.success(t("shopping.toast.listReopened"));
    }
    loadList(list.id);
    loadItems(list.id);
  };

  const handleRestoreInventory = () => {
    if (!list) return;
    const confirmed = window.confirm(
      t("shopping.confirm.restoreInventory", { values: { title: list.title } })
    );
    if (!confirmed) return;

    const db = getDatabase();
    const result = rollbackLatestListTransfer(db, list.id);

    if (result.status === "success") {
      saveDatabase();
      toast.success(
        t("shopping.toast.inventoryRestored", {
          values: { count: result.updatedProducts }
        })
      );
    } else if (result.status === "insufficient_stock") {
      toast.error(
        t("shopping.toast.inventoryRestoreInsufficient", {
          values: { count: result.insufficientProducts }
        })
      );
    } else if (result.status === "missing_products") {
      toast.error(
        t("shopping.toast.inventoryRestoreMissing", {
          values: { count: result.missingProducts }
        })
      );
    } else {
      toast.error(t("shopping.toast.inventoryRestoreUnavailable"));
    }

    loadList(list.id);
    loadItems(list.id);
  };

  const handleTransferNow = () => {
    if (!list || !isMonthlyRestock) return;
    const db = getDatabase();
    const transferResult = transferMonthlyRestock(db, list.id);
    saveDatabase();
    toast.success(
      t("shopping.toast.itemsTransferred", {
        values: { count: transferResult.updatedProducts || transferResult.totalQuantity }
      })
    );
    loadItems(list.id);
    loadList(list.id);
  };

  const handleEditItem = (item: ShoppingListItemWithProduct) => {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      productId: item.product_id ? String(item.product_id) : "",
      quantityValue: String(item.quantity_value ?? 1),
      quantityLabel: item.quantity_label ?? "",
      estimatedUnitCost: String(item.estimated_unit_cost || item.product_buy_price || 0),
      sellPrice: String(item.sell_price ?? item.product_sell_price ?? 0),
      category: item.category || item.product_category || "",
      notes: item.notes ?? ""
    });
    setIsItemDialogOpen(true);
  };

  const handleExportList = () => {
    if (!list) {
      toast.error(t("shopping.detail.toast.listMissing"));
      return;
    }

    const itemHeader = [
      t("shopping.detail.export.columns.itemName"),
      t("shopping.detail.export.columns.itemCategory"),
      t("shopping.detail.export.columns.itemQuantity"),
      t("shopping.detail.export.columns.itemBuyPrice"),
      t("shopping.detail.export.columns.itemSellPrice"),
      t("shopping.detail.export.columns.itemUnitCost"),
      t("shopping.detail.export.columns.itemEstimatedTotal")
    ];

    const buildItemRows = (sourceItems: ShoppingListItemWithProduct[]) => {
      return sourceItems.map(item => {
        const buyPrice = item.product_buy_price ?? item.estimated_unit_cost ?? 0;
        const sellPrice = item.sell_price ?? item.product_sell_price ?? 0;
        const unitCost = item.estimated_unit_cost > 0
          ? item.estimated_unit_cost
          : item.product_buy_price ?? 0;
        const itemTotal = unitCost * item.quantity_value;
        return [
          item.name,
          item.category || item.product_category || "-",
          item.quantity_value,
          buyPrice,
          sellPrice,
          unitCost,
          itemTotal
        ];
      });
    };

    const rows: Array<Array<string | number>> = [
      [t("shopping.detail.export.columns.listName"), list.title],
      [],
      [t("shopping.detail.export.columns.pendingItems"), pendingItems.length],
      itemHeader,
      ...buildItemRows(pendingItems),
      [],
      [t("shopping.detail.export.columns.completedItems"), completedItems.length],
      itemHeader,
      ...buildItemRows(completedItems),
      [],
      [t("shopping.detail.export.columns.status"), statusLabel(list.status)],
      [t("shopping.detail.export.columns.estimatedTotal"), totalEstimatedCost],
      [t("shopping.detail.export.columns.pendingBudget"), pendingEstimatedCost]
    ];

    exportSheetsAsExcel(
      `${list.title.replace(/\s+/g, "_").toLowerCase()}_shopping_list.xlsx`,
      [{ name: t("shopping.detail.export.summarySheet"), rows }]
    ).catch(() => toast.error(t("shopping.detail.toast.listSaveError")));
  };

  if (!Number.isFinite(listId)) {
    return (
      <Layout title={t("shopping.detail.title")}>
        <Card className="m-6 p-6 text-center text-muted-foreground">
          {t("shopping.detail.invalidUrl")}
          <div className="mt-4">
            <Button onClick={() => navigate("/shopping-list")}>{t("shopping.actions.back")}</Button>
          </div>
        </Card>
      </Layout>
    );
  }

  if (!list) {
    return (
      <Layout title={t("shopping.detail.title")}>
        <Card className="m-6 p-6 text-center text-muted-foreground">
          {t("shopping.detail.notFound")}
          <div className="mt-4">
            <Button onClick={() => navigate("/shopping-list")}>{t("shopping.actions.back")}</Button>
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title={list.title}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" className="w-fit" onClick={() => navigate("/shopping-list")}> 
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("shopping.actions.back")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExportList}>
              <Download className="mr-2 h-4 w-4" />
              {t("shopping.actions.export")}
            </Button>
            {isMonthlyRestock && (
              <Button onClick={handleTransferNow}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                {t("shopping.monthly.transfer", { defaultValue: "Transfer items" })}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  {t("shopping.detail.actions.manage")}
                  <MoreHorizontal className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handleEditList}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t("shopping.detail.actions.editDetails")}
                </DropdownMenuItem>
                {isMonthlyRestock ? (
                  <DropdownMenuItem onSelect={handleTransferNow}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {t("shopping.monthly.transfer", { defaultValue: "Transfer items" })}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={handleToggleListStatus}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {list.status === "completed"
                      ? t("shopping.actions.reopen")
                      : t("shopping.actions.markCompleted")}
                  </DropdownMenuItem>
                )}
                {list.has_backup && (
                  <DropdownMenuItem onSelect={handleRestoreInventory}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {t("shopping.actions.restoreInventory")}
                  </DropdownMenuItem>
                )}
                {!isMonthlyRestock && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={handleDeleteList}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("shopping.actions.deleteList")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Card className="space-y-4 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{list.title}</h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{listTypeLabel(list.type)}</Badge>
                <Badge variant={priorityVariant(list.priority)}>
                  {t("shopping.priority.badge", { values: { priority: priorityLabel(list.priority) } })}
                </Badge>
                <Badge variant="outline">{statusLabel(list.status)}</Badge>
                {list.customer_name && <Badge>{list.customer_name}</Badge>}
                {formatDate(list.due_date) && (
                  <span>{t("shopping.list.due", { values: { date: formatDate(list.due_date) } })}</span>
                )}
              </div>
              {list.notes && (
                <p className="max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
                  {list.notes}
                </p>
              )}
              {isMonthlyRestock && (
                <p className="text-xs text-muted-foreground">
                  {t("shopping.monthly.helper", { defaultValue: "Sales automatically add sold quantities back here for the next restock." })}
                </p>
              )}
            </div>
            <div className="space-y-3 text-right">
              <div>
                <p className="text-sm text-muted-foreground">{t("shopping.detail.stats.totalEstimated")}</p>
                <p className="text-lg font-semibold">{formatMoney(totalEstimatedCost)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("shopping.detail.stats.pendingBudget")}</p>
                <p className="text-lg font-semibold">{formatMoney(pendingEstimatedCost)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {t("shopping.detail.stats.progress")}
              </span>
              <span className="text-sm text-muted-foreground">{progressValue}%</span>
            </div>
            <Progress value={progressValue} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t("shopping.detail.stats.pendingItems")}</p>
                <p className="text-lg font-semibold">{list.pending_count}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t("shopping.detail.stats.completedItems")}</p>
                <p className="text-lg font-semibold">{list.completed_count}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t("shopping.detail.stats.created")}</p>
                <p className="text-lg font-semibold">{new Date(list.created_at).toLocaleDateString()}</p>
              </Card>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold">{t("shopping.detail.sections.items")}</h3>
          <Dialog open={isItemDialogOpen} onOpenChange={handleItemDialogOpenChange}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsItemDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("shopping.detail.form.submit.add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingItemId
                    ? t("shopping.detail.dialog.editItem")
                    : t("shopping.detail.dialog.addItem")}
                </DialogTitle>
                <DialogDescription>{t("shopping.detail.dialog.itemDescription")}</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleSubmitItem}>
                <div className="space-y-2">
                  <Label>{t("shopping.detail.form.depotProduct")}</Label>
                  <Select value={itemForm.productId || "custom"} onValueChange={handleProductSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("shopping.detail.form.productPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">{t("shopping.detail.form.customItem")}</SelectItem>
                      {products.map(product => (
                        <SelectItem key={product.id} value={String(product.id)}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-name">{t("shopping.detail.form.name")}</Label>
                  <Input
                    id="item-name"
                    value={itemForm.name}
                    onChange={event => handleItemFormChange("name", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-category">{t("shopping.detail.form.category", { defaultValue: "Category" })}</Label>
                  <Input
                    id="item-category"
                    list="shopping-category-options"
                    value={itemForm.category}
                    placeholder={t("shopping.detail.form.categoryPlaceholder", { defaultValue: "Search or type a category" })}
                    onChange={event => handleItemFormChange("category", event.target.value)}
                  />
                  <datalist id="shopping-category-options">
                    {categoryOptions.map(option => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="item-quantity">{t("shopping.detail.form.quantity")}</Label>
                    <Input
                      id="item-quantity"
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemForm.quantityValue}
                      onChange={event => handleItemFormChange("quantityValue", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="item-quantity-label">{t("shopping.detail.form.unit")}</Label>
                    <Input
                      id="item-quantity-label"
                      value={itemForm.quantityLabel}
                      onChange={event => handleItemFormChange("quantityLabel", event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="item-estimated-cost">{t("shopping.detail.form.estimatedUnitCost")}</Label>
                    <Input
                      id="item-estimated-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemForm.estimatedUnitCost}
                      onChange={event => handleItemFormChange("estimatedUnitCost", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="item-sell-price">{t("shopping.detail.form.sellPrice", { defaultValue: "Sell price" })}</Label>
                    <Input
                      id="item-sell-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemForm.sellPrice}
                      onChange={event => handleItemFormChange("sellPrice", event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-notes">{t("shopping.form.notes")}</Label>
                  <Textarea
                    id="item-notes"
                    rows={3}
                    value={itemForm.notes}
                    onChange={event => handleItemFormChange("notes", event.target.value)}
                    placeholder={t("shopping.detail.form.notesPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="w-full sm:w-auto">
                      {t("common.cancel")}
                    </Button>
                  </DialogClose>
                  <Button type="submit" className="w-full sm:w-auto">
                    {editingItemId
                      ? t("shopping.detail.form.submit.save")
                      : t("shopping.detail.form.submit.add")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold">{t("shopping.detail.pending.title")}</h4>
              <Badge variant="secondary">{pendingItems.length}</Badge>
            </div>
            {pendingItems.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">
                {t("shopping.detail.pending.empty")}
              </Card>
            )}
            {pendingItems.map(item => {
              const unitCost = item.estimated_unit_cost > 0
                ? item.estimated_unit_cost
                : item.product_buy_price ?? 0;
              const itemTotal = unitCost * item.quantity_value;
              const sellPrice = item.sell_price ?? item.product_sell_price ?? 0;
              const itemCategory = item.category || item.product_category || null;
              return (
                <Card key={item.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={item.is_completed === 1}
                      onCheckedChange={() => handleToggleCompleted(item)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="font-semibold text-foreground">{item.name}</h5>
                            {item.product_id && (
                              <Badge variant="outline">{t("shopping.detail.items.linkedToDepot")}</Badge>
                            )}
                            {itemCategory && <Badge variant="secondary">{itemCategory}</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {t("shopping.detail.items.quantityPrefix")} {item.quantity_value}{" "}
                            {item.quantity_label && <span>{item.quantity_label}</span>}
                          </div>
                          {item.product_name && (
                            <div className="text-xs text-muted-foreground">
                              {t("shopping.detail.items.productInfo", {
                                values: {
                                  stock: item.product_quantity ?? 0,
                                  price: formatMoney(item.product_buy_price ?? 0)
                                }
                              })}
                            </div>
                          )}
                          {sellPrice > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {t("shopping.detail.items.sellPriceInfo", {
                                defaultValue: "Sell price: {price}",
                                values: { price: formatMoney(sellPrice) }
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEditItem(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t("shopping.detail.items.costSummary", {
                          values: {
                            unitCost: formatMoney(unitCost),
                            total: formatMoney(itemTotal)
                          }
                        })}
                      </div>
                      {item.notes && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("shopping.detail.items.addedOn", {
                      values: { date: new Date(item.created_at).toLocaleString() }
                    })}
                  </div>
                </Card>
              );
            })}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold">{t("shopping.detail.completed.title")}</h4>
              <Badge variant="outline">{completedItems.length}</Badge>
            </div>
            {completedItems.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">
                {t("shopping.detail.completed.empty")}
              </Card>
            )}
            {completedItems.map(item => {
              const unitCost = item.estimated_unit_cost > 0
                ? item.estimated_unit_cost
                : item.product_buy_price ?? 0;
              const itemTotal = unitCost * item.quantity_value;
              const sellPrice = item.sell_price ?? item.product_sell_price ?? 0;
              const itemCategory = item.category || item.product_category || null;
              return (
                <Card key={item.id} className="space-y-3 bg-muted/40 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={item.is_completed === 1}
                      onCheckedChange={() => handleToggleCompleted(item)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="font-semibold text-foreground line-through">{item.name}</h5>
                            {item.product_id && (
                              <Badge variant="outline">{t("shopping.detail.items.linkedToDepot")}</Badge>
                            )}
                            {itemCategory && <Badge variant="secondary">{itemCategory}</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {t("shopping.detail.items.quantityPrefix")} {item.quantity_value}{" "}
                            {item.quantity_label && <span>{item.quantity_label}</span>}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t("shopping.detail.items.finalCost", { values: { total: formatMoney(itemTotal) } })}
                      </div>
                      {sellPrice > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t("shopping.detail.items.sellPriceInfo", {
                            defaultValue: "Sell price: {price}",
                            values: { price: formatMoney(sellPrice) }
                          })}
                        </div>
                      )}
                      {item.notes && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("shopping.detail.items.completedOn", {
                      values: { date: new Date(item.created_at).toLocaleString() }
                    })}
                  </div>
                </Card>
              );
            })}
          </section>
        </div>
      </div>

      <Dialog open={isListDialogOpen} onOpenChange={handleListDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("shopping.detail.dialog.listTitle")}</DialogTitle>
            <DialogDescription>{t("shopping.detail.dialog.listDescription")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmitList}>
            <div className="space-y-2">
              <Label htmlFor="list-title">{t("shopping.form.title")}</Label>
              <Input
                id="list-title"
                value={listForm.title}
                onChange={event => setListForm(prev => ({ ...prev, title: event.target.value }))}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("shopping.form.type")}</Label>
                <Select
                  value={listForm.type}
                  onValueChange={value =>
                    setListForm(prev => ({
                      ...prev,
                      type: value as ShoppingList["type"],
                      customerId: value === "customer_order" ? prev.customerId : ""
                    }))
                  }
                >
                          <SelectTrigger>
                            <SelectValue placeholder={t("shopping.form.typePlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="restock">{t("shopping.type.restock")}</SelectItem>
                            <SelectItem value="customer_order">{t("shopping.type.customerOrder")}</SelectItem>
                            <SelectItem value={MONTHLY_RESTOCK_TYPE} disabled>
                              {t("shopping.type.monthlyRestock", { defaultValue: "Monthly restock" })}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
              <div className="space-y-2">
                <Label>{t("shopping.form.status")}</Label>
                <Select
                  value={listForm.status}
                  onValueChange={value => setListForm(prev => ({ ...prev, status: value as ShoppingList["status"] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("shopping.form.statusPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("shopping.status.active")}</SelectItem>
                    <SelectItem value="completed">{t("shopping.status.completed")}</SelectItem>
                    <SelectItem value="archived">{t("shopping.status.archived")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("shopping.form.priority")}</Label>
                <Select
                  value={listForm.priority}
                  onValueChange={value => setListForm(prev => ({ ...prev, priority: value as ShoppingList["priority"] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("shopping.form.priorityPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">{t("shopping.priority.high")}</SelectItem>
                    <SelectItem value="medium">{t("shopping.priority.medium")}</SelectItem>
                    <SelectItem value="low">{t("shopping.priority.low")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="list-due-date">{t("shopping.form.expectedDate")}</Label>
                <Input
                  id="list-due-date"
                  type="date"
                  value={listForm.dueDate}
                  onChange={event => setListForm(prev => ({ ...prev, dueDate: event.target.value }))}
                />
              </div>
            </div>
            {listForm.type === "customer_order" && (
              <div className="space-y-2">
                <Label>{t("shopping.form.customer")}</Label>
                <Select
                  value={listForm.customerId ? listForm.customerId : UNASSIGNED_CUSTOMER_VALUE}
                  onValueChange={value =>
                    setListForm(prev => ({
                      ...prev,
                      customerId: value === UNASSIGNED_CUSTOMER_VALUE ? "" : value
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("shopping.form.customerPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_CUSTOMER_VALUE}>{t("shopping.form.customerUnassigned")}</SelectItem>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="list-notes">{t("shopping.form.notes")}</Label>
              <Textarea
                id="list-notes"
                rows={3}
                value={listForm.notes}
                onChange={event => setListForm(prev => ({ ...prev, notes: event.target.value }))}
                placeholder={t("shopping.form.notesPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="w-full sm:w-auto">
                  {t("common.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" className="w-full sm:w-auto">
                {t("shopping.form.submit.save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
