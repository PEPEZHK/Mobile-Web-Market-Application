import { useState, useEffect, useMemo, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getDatabase, listProducts, saveDatabase } from "@/lib/db";
import { formatQuantityWithUnit, getQuantityInputStep, getQuantityStep, getUnitLabel, resolveProductUnit } from "@/lib/units";
import { Product, ProductUnit } from "@/types";
import {
  Plus,
  Search,
  AlertTriangle,
  Pencil,
  Minus,
  Download,
  Trash2,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatCurrency } from "@/lib/utils";
import { exportSheetsAsExcel } from "@/lib/export-excel";
import { syncMonthlyRestockFromDepot } from "@/lib/shopping";

interface ProductFormState {
  name: string;
  barcode: string;
  category: string;
  buy_price: string;
  sell_price: string;
  quantity: string;
  min_stock: string;
  unit: ProductUnit;
}

const defaultProductForm: ProductFormState = {
  name: "",
  barcode: "",
  category: "",
  buy_price: "0",
  sell_price: "0",
  quantity: "0",
  min_stock: "5",
  unit: "pcs",
};

export default function Depot() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductFormState>(defaultProductForm);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  });
  const [inventoryTotals, setInventoryTotals] = useState({ buy: 0, sell: 0 });
  const [monthlySalesTotal, setMonthlySalesTotal] = useState(0);
  const [monthlyProfitTotal, setMonthlyProfitTotal] = useState(0);
  const { t } = useTranslation();

  const encodeCategory = (value: string) => (value === "" ? "__uncategorized__" : value);
  const decodeCategory = (value: string) => (value === "__uncategorized__" ? "" : value);

  const categories = useMemo(() => {
    const unique = new Set(products.map((product) => product.category?.trim() ?? ""));
    return ["all", ...Array.from(unique)];
  }, [products]);

  const applyFilters = useCallback((source?: Product[]) => {
    const base = source ?? products;
    let filtered = base;

    if (searchQuery) {
      const normalizedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.barcode.toLowerCase().includes(normalizedQuery),
      );
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter((product) => (product.category?.trim() ?? "") === selectedCategory);
    }

    setFilteredProducts(filtered);
  }, [products, searchQuery, selectedCategory]);

  const recalculateTotals = useCallback((source?: Product[]) => {
    const base = source ?? products;
    const totals = base.reduce(
      (accumulator, product) => ({
        buy: accumulator.buy + (product.buy_price * product.quantity),
        sell: accumulator.sell + (product.sell_price * product.quantity),
      }),
      { buy: 0, sell: 0 },
    );
    setInventoryTotals(totals);
  }, [products]);

  const recalculateMonthlySales = useCallback((monthValue?: string) => {
    const db = getDatabase();
    const monthFilter = monthValue ?? selectedMonth;
    if (!monthFilter) {
      const totalResult = db.exec("SELECT COALESCE(SUM(total_amount), 0) FROM transactions");
      const total = totalResult[0]?.values?.[0]?.[0] as number | undefined;
      setMonthlySalesTotal(Number(total ?? 0));
      return;
    }

    const result = db.exec(
      "SELECT COALESCE(SUM(total_amount), 0) FROM transactions WHERE strftime('%Y-%m', date) = ?",
      [monthFilter],
    );
    const value = result[0]?.values?.[0]?.[0] as number | undefined;
    setMonthlySalesTotal(Number(value ?? 0));
  }, [selectedMonth]);

  const recalculateMonthlyProfit = useCallback((monthValue?: string) => {
    const db = getDatabase();
    const monthFilter = monthValue ?? selectedMonth;
    if (!monthFilter) {
      const totalResult = db.exec(`
        SELECT
          COALESCE(SUM(ti.quantity * ti.unit_price), 0) as revenue,
          COALESCE(SUM(ti.quantity * COALESCE(p.buy_price, 0)), 0) as cost
        FROM transaction_items ti
        JOIN transactions t ON t.id = ti.transaction_id
        LEFT JOIN products p ON p.id = ti.product_id
      `);
      const revenue = totalResult[0]?.values?.[0]?.[0] as number | undefined;
      const cost = totalResult[0]?.values?.[0]?.[1] as number | undefined;
      setMonthlyProfitTotal(Number(revenue ?? 0) - Number(cost ?? 0));
      return;
    }

    const result = db.exec(
      `
        SELECT
          COALESCE(SUM(ti.quantity * ti.unit_price), 0) as revenue,
          COALESCE(SUM(ti.quantity * COALESCE(p.buy_price, 0)), 0) as cost
        FROM transaction_items ti
        JOIN transactions t ON t.id = ti.transaction_id
        LEFT JOIN products p ON p.id = ti.product_id
        WHERE strftime('%Y-%m', t.date) = ?
      `,
      [monthFilter],
    );
    const revenue = result[0]?.values?.[0]?.[0] as number | undefined;
    const cost = result[0]?.values?.[0]?.[1] as number | undefined;
    setMonthlyProfitTotal(Number(revenue ?? 0) - Number(cost ?? 0));
  }, [selectedMonth]);

  const loadProducts = useCallback(() => {
    const loadedProducts = listProducts();
    setProducts(loadedProducts);
    applyFilters(loadedProducts);
    recalculateTotals(loadedProducts);
    recalculateMonthlySales(selectedMonth);
    recalculateMonthlyProfit(selectedMonth);
  }, [applyFilters, recalculateMonthlyProfit, recalculateMonthlySales, recalculateTotals, selectedMonth]);

  useEffect(() => {
    if (selectedCategory !== "all" && !categories.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    recalculateMonthlySales(selectedMonth);
    recalculateMonthlyProfit(selectedMonth);
  }, [recalculateMonthlyProfit, recalculateMonthlySales, selectedMonth]);

  const resetProductForm = () => {
    setProductForm(defaultProductForm);
    setEditingProduct(null);
  };

  const openAddDialog = () => {
    resetProductForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      barcode: product.barcode,
      category: product.category,
      buy_price: product.buy_price.toString(),
      sell_price: product.sell_price.toString(),
      quantity: product.quantity.toString(),
      min_stock: product.min_stock.toString(),
      unit: product.unit,
    });
    setIsDialogOpen(true);
  };

  const handleProductFormChange = (field: keyof Omit<ProductFormState, "unit">, value: string) => {
    setProductForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === "category") {
        next.unit = resolveProductUnit(value);
      }

      return next;
    });
  };

  const handleSaveProduct = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const db = getDatabase();
    const resolvedUnit = resolveProductUnit(productForm.category);

    try {
      if (editingProduct) {
        db.run(
          `
            UPDATE products
            SET name=?, barcode=?, category=?, buy_price=?, sell_price=?, quantity=?, min_stock=?, unit=?
            WHERE id=?
          `,
          [
            productForm.name.trim(),
            productForm.barcode.trim() || null,
            productForm.category.trim() || null,
            Number.parseFloat(productForm.buy_price) || 0,
            Number.parseFloat(productForm.sell_price) || 0,
            Number.parseFloat(productForm.quantity) || 0,
            Number.parseFloat(productForm.min_stock) || 0,
            resolvedUnit,
            editingProduct.id,
          ],
        );
        toast.success(t("depot.toast.updated"));
      } else {
        db.run(
          `
            INSERT INTO products (name, barcode, category, buy_price, sell_price, quantity, min_stock, unit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            productForm.name.trim(),
            productForm.barcode.trim() || null,
            productForm.category.trim() || null,
            Number.parseFloat(productForm.buy_price) || 0,
            Number.parseFloat(productForm.sell_price) || 0,
            Number.parseFloat(productForm.quantity) || 0,
            Number.parseFloat(productForm.min_stock) || 0,
            resolvedUnit,
          ],
        );
        toast.success(t("depot.toast.added"));
      }

      syncMonthlyRestockFromDepot(db);
      saveDatabase();
      loadProducts();
      setIsDialogOpen(false);
      resetProductForm();
    } catch (error) {
      toast.error(t("depot.toast.savedError"));
      console.error(error);
    }
  };

  const adjustQuantity = (product: Product, change: number) => {
    const nextQuantity = product.quantity + change;
    if (nextQuantity < 0) {
      toast.error(t("depot.toast.noNegativeStock"));
      return;
    }

    const db = getDatabase();
    db.run("UPDATE products SET quantity = quantity + ? WHERE id = ?", [change, product.id]);
    syncMonthlyRestockFromDepot(db);
    saveDatabase();
    loadProducts();
    toast.success(change > 0 ? t("depot.toast.increased") : t("depot.toast.decreased"));
  };

  const handleDeleteProduct = (product: Product) => {
    const confirmed = window.confirm(
      t("depot.confirm.delete", { values: { name: product.name } }),
    );
    if (!confirmed) {
      return;
    }

    const db = getDatabase();
    db.run("UPDATE shopping_list_items SET product_id = NULL WHERE product_id = ?", [product.id]);
    db.run("DELETE FROM products WHERE id = ?", [product.id]);
    syncMonthlyRestockFromDepot(db);
    saveDatabase();
    toast.success(t("depot.toast.deleted"));
    loadProducts();
  };

  const handleDeleteAllProducts = () => {
    if (products.length === 0) {
      toast.error(t("depot.toast.noProductsToDelete"));
      return;
    }

    const confirmed = window.confirm(t("depot.confirm.deleteAll"));
    if (!confirmed) {
      return;
    }

    const db = getDatabase();
    db.run("UPDATE shopping_list_items SET product_id = NULL WHERE product_id IS NOT NULL");
    db.run("DELETE FROM products");
    syncMonthlyRestockFromDepot(db);
    saveDatabase();
    toast.success(t("depot.toast.allDeleted"));
    setSelectedCategory("all");
    loadProducts();
  };

  const exportProductsToExcel = () => {
    if (filteredProducts.length === 0) {
      toast.error(t("depot.toast.noExport"));
      return;
    }

    const rows: Array<Array<string | number>> = [[
      t("depot.export.name"),
      t("depot.export.barcode"),
      t("depot.export.category"),
      t("common.unit"),
      t("depot.export.buyPrice"),
      t("depot.export.sellPrice"),
      t("depot.export.quantity"),
      t("depot.export.minStock"),
    ]];

    filteredProducts.forEach((product) => {
      rows.push([
        product.name,
        product.barcode || "-",
        product.category || "-",
        getUnitLabel(product.unit, t, "short"),
        product.buy_price,
        product.sell_price,
        product.quantity,
        product.min_stock,
      ]);
    });

    exportSheetsAsExcel(`${t("depot.export.filename")}.xlsx`, [
      { name: t("depot.export.sheetName"), rows },
    ]).catch(() => toast.error(t("depot.toast.noExport")));
  };

  return (
    <Layout title={t("depot.title")}>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid grid-cols-2 gap-4 flex-1">
              <div>
                <div className="text-sm text-muted-foreground">{t("depot.totals.buy", { defaultValue: "Total buy" })}</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(inventoryTotals.buy)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t("depot.totals.sell", { defaultValue: "Total sell" })}</div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(inventoryTotals.sell)}
                </div>
              </div>
            </div>
            <div className="w-full sm:w-64 space-y-2">
              <Label className="text-sm text-muted-foreground">{t("depot.totals.monthSelector", { defaultValue: "Sales month" })}</Label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setSelectedMonth("")}
                disabled={!selectedMonth}
              >
                {t("depot.totals.clearMonth", { defaultValue: "Show all" })}
              </Button>
              <div className="text-sm">
                {t("depot.totals.monthlySales", { defaultValue: "Sales total" })}:{" "}
                <span className="font-semibold">{formatCurrency(monthlySalesTotal)}</span>
              </div>
              <div className="text-sm">
                {t("depot.totals.monthlyProfit", { defaultValue: "Profit" })}:{" "}
                <span className={`font-semibold ${monthlyProfitTotal >= 0 ? "" : "text-destructive"}`}>
                  {formatCurrency(monthlyProfitTotal)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("depot.search.placeholder")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  resetProductForm();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={openAddDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("depot.add")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProduct ? t("depot.editProduct") : t("depot.addProduct")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveProduct} className="space-y-4">
                  <div>
                    <Label htmlFor="name">{t("depot.form.name")}</Label>
                    <Input
                      id="name"
                      value={productForm.name}
                      onChange={(event) => handleProductFormChange("name", event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="barcode">{t("depot.form.barcode")}</Label>
                    <Input
                      id="barcode"
                      value={productForm.barcode}
                      onChange={(event) => handleProductFormChange("barcode", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">{t("depot.form.category")}</Label>
                    <Input
                      id="category"
                      value={productForm.category}
                      onChange={(event) => handleProductFormChange("category", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="unit">{t("depot.form.unit")}</Label>
                    <Input id="unit" value={getUnitLabel(productForm.unit, t)} readOnly />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="buy_price">{t("depot.form.buyPrice")}</Label>
                      <Input
                        id="buy_price"
                        type="number"
                        step="0.01"
                        value={productForm.buy_price}
                        onChange={(event) => handleProductFormChange("buy_price", event.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="sell_price">{t("depot.form.sellPrice")}</Label>
                      <Input
                        id="sell_price"
                        type="number"
                        step="0.01"
                        value={productForm.sell_price}
                        onChange={(event) => handleProductFormChange("sell_price", event.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="quantity">{t("depot.form.quantity")}</Label>
                      <Input
                        id="quantity"
                        type="number"
                        step={getQuantityInputStep(productForm.unit)}
                        value={productForm.quantity}
                        onChange={(event) => handleProductFormChange("quantity", event.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="min_stock">{t("depot.form.minStock")}</Label>
                      <Input
                        id="min_stock"
                        type="number"
                        step={getQuantityInputStep(productForm.unit)}
                        value={productForm.min_stock}
                        onChange={(event) => handleProductFormChange("min_stock", event.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="w-full sm:w-auto">
                        {t("common.cancel")}
                      </Button>
                    </DialogClose>
                    <Button type="submit" className="w-full sm:w-auto">
                      {t("depot.form.save")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={exportProductsToExcel} className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" />
              {t("depot.export")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllProducts}
              className="w-full sm:w-auto"
              disabled={products.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("depot.actions.deleteAll")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-sm font-medium text-muted-foreground">{t("depot.filter.category")}</span>
          <Popover open={isCategoryPickerOpen} onOpenChange={setIsCategoryPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full sm:w-[260px] justify-between"
              >
                {selectedCategory === "all"
                  ? t("depot.filter.all")
                  : selectedCategory
                    ? selectedCategory
                    : t("depot.filter.uncategorized")}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[260px]" align="start">
              <Command>
                <CommandInput placeholder={t("depot.filter.searchPlaceholder")} />
                <CommandList>
                  <CommandEmpty>{t("depot.filter.noResults")}</CommandEmpty>
                  <CommandGroup>
                    {categories.map((categoryValue) => {
                      const encoded = categoryValue === "all" ? "all" : encodeCategory(categoryValue);
                      const label =
                        categoryValue === "all"
                          ? t("depot.filter.all")
                          : categoryValue
                            ? categoryValue
                            : t("depot.filter.uncategorized");

                      return (
                        <CommandItem
                          key={encoded}
                          value={encoded}
                          onSelect={(value) => {
                            if (value === "all") {
                              setSelectedCategory("all");
                            } else {
                              setSelectedCategory(decodeCategory(value));
                            }
                            setIsCategoryPickerOpen(false);
                          }}
                        >
                          {label}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-3">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{product.name}</h3>
                    {product.quantity < product.min_stock && (
                      <Badge variant="destructive" className="bg-warning text-warning-foreground">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {t("depot.badge.low")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{product.barcode}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="secondary">{product.category}</Badge>
                    <Badge variant="outline">{getUnitLabel(product.unit, t, "short")}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleDeleteProduct(product)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("depot.price.buy")} </span>
                  <span className="font-medium">{formatCurrency(product.buy_price)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("depot.price.sell")} </span>
                  <span className="font-medium">{formatCurrency(product.sell_price)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjustQuantity(product, -getQuantityStep(product.unit))}
                  disabled={product.quantity <= 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {formatQuantityWithUnit(product.quantity, product.unit, t)}
                  </div>
                  <div className="text-xs text-muted-foreground">{t("depot.stock")}</div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjustQuantity(product, getQuantityStep(product.unit))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {t("depot.empty")}
          </div>
        )}
      </div>
    </Layout>
  );
}
