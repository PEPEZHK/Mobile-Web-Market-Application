import { useState, useEffect, useMemo, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getDatabase, saveDatabase } from "@/lib/db";
import { Product } from "@/types";
import {
  Plus,
  Search,
  AlertTriangle,
  Pencil,
  Minus,
  Download,
  Trash2,
  ChevronsUpDown
} from "lucide-react";
import { toast } from "sonner";
import { downloadExcelFile } from "@/lib/excel";
import { useTranslation } from "@/hooks/useTranslation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";

export default function Depot() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const { t } = useTranslation();

  const encodeCategory = (value: string) => (value === "" ? "__uncategorized__" : value);
  const decodeCategory = (value: string) => (value === "__uncategorized__" ? "" : value);

  const categories = useMemo(() => {
    const unique = new Set(products.map(p => (p.category?.trim() ?? "")));
    return ["all", ...Array.from(unique)];
  }, [products]);

  const loadProducts = useCallback(() => {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM products ORDER BY name');
    if (result[0]) {
      const prods = result[0].values.map((row) => ({
        id: row[0] as number,
        name: row[1] as string,
        barcode: row[2] as string,
        category: row[3] as string,
        buy_price: row[4] as number,
        sell_price: row[5] as number,
        quantity: row[6] as number,
        min_stock: row[7] as number,
        created_at: row[8] as string,
      }));
      setProducts(prods);
      return;
    }

    setProducts([]);
  }, []);

  useEffect(() => {
    if (selectedCategory !== "all" && !categories.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    let filtered = products;

    if (searchQuery) {
      const normalizedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(normalizedQuery) ||
        p.barcode.toLowerCase().includes(normalizedQuery)
      );
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(p => (p.category?.trim() ?? "") === selectedCategory);
    }

    setFilteredProducts(filtered);
  }, [products, searchQuery, selectedCategory]);

  const handleSaveProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const db = getDatabase();

    try {
      if (editingProduct) {
        db.run(
          `UPDATE products SET name=?, barcode=?, category=?, buy_price=?, sell_price=?, quantity=?, min_stock=? WHERE id=?`,
          [
            formData.get('name'),
            formData.get('barcode'),
            formData.get('category'),
            parseFloat(formData.get('buy_price') as string),
            parseFloat(formData.get('sell_price') as string),
            parseInt(formData.get('quantity') as string),
            parseInt(formData.get('min_stock') as string),
            editingProduct.id
          ]
        );
        toast.success(t("depot.toast.updated"));
      } else {
        db.run(
          `INSERT INTO products (name, barcode, category, buy_price, sell_price, quantity, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            formData.get('name'),
            formData.get('barcode'),
            formData.get('category'),
            parseFloat(formData.get('buy_price') as string),
            parseFloat(formData.get('sell_price') as string),
            parseInt(formData.get('quantity') as string),
            parseInt(formData.get('min_stock') as string)
          ]
        );
        toast.success(t("depot.toast.added"));
      }
      
      saveDatabase();
      loadProducts();
      setIsDialogOpen(false);
      setEditingProduct(null);
    } catch (error) {
      toast.error(t("depot.toast.savedError"));
      console.error(error);
    }
  };

  const adjustQuantity = (productId: number, change: number) => {
    const db = getDatabase();
    db.run(`UPDATE products SET quantity = quantity + ? WHERE id = ?`, [change, productId]);
    saveDatabase();
    loadProducts();
    toast.success(change > 0 ? t("depot.toast.increased") : t("depot.toast.decreased"));
  };

  const handleDeleteProduct = (product: Product) => {
    const confirmed = window.confirm(
      t("depot.confirm.delete", { values: { name: product.name } })
    );
    if (!confirmed) {
      return;
    }

    const db = getDatabase();
    db.run("UPDATE shopping_list_items SET product_id = NULL WHERE product_id = ?", [product.id]);
    db.run("DELETE FROM products WHERE id = ?", [product.id]);
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
      t("depot.export.buyPrice"),
      t("depot.export.sellPrice"),
      t("depot.export.quantity"),
      t("depot.export.minStock"),
    ]];

    filteredProducts.forEach(product => {
      rows.push([
        product.name,
        product.barcode || "-",
        product.category || "-",
        product.buy_price,
        product.sell_price,
        product.quantity,
        product.min_stock
      ]);
    });

    downloadExcelFile(`${t("depot.export.filename")}.xls`, [
      { name: t("depot.export.sheetName"), rows }
    ]);
  };

  return (
    <Layout title={t("depot.title")}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("depot.search.placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingProduct(null)}>
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
                    <Input id="name" name="name" defaultValue={editingProduct?.name} required />
                  </div>
                  <div>
                    <Label htmlFor="barcode">{t("depot.form.barcode")}</Label>
                    <Input id="barcode" name="barcode" defaultValue={editingProduct?.barcode} />
                  </div>
                  <div>
                    <Label htmlFor="category">{t("depot.form.category")}</Label>
                    <Input id="category" name="category" defaultValue={editingProduct?.category} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="buy_price">{t("depot.form.buyPrice")}</Label>
                      <Input id="buy_price" name="buy_price" type="number" step="0.01" defaultValue={editingProduct?.buy_price} required />
                    </div>
                    <div>
                      <Label htmlFor="sell_price">{t("depot.form.sellPrice")}</Label>
                      <Input id="sell_price" name="sell_price" type="number" step="0.01" defaultValue={editingProduct?.sell_price} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="quantity">{t("depot.form.quantity")}</Label>
                      <Input id="quantity" name="quantity" type="number" defaultValue={editingProduct?.quantity || 0} required />
                    </div>
                    <div>
                      <Label htmlFor="min_stock">{t("depot.form.minStock")}</Label>
                      <Input id="min_stock" name="min_stock" type="number" defaultValue={editingProduct?.min_stock || 5} required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">{t("depot.form.save")}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={exportProductsToExcel} className="flex-1 sm:flex-none">
              <Download className="h-4 w-4 mr-2" />
              {t("depot.export")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllProducts}
              className="flex-1 sm:flex-none"
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
                  : (selectedCategory ? selectedCategory : t("depot.filter.uncategorized"))}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[260px]" align="start">
              <Command>
                <CommandInput placeholder={t("depot.filter.searchPlaceholder")} />
                <CommandList>
                  <CommandEmpty>{t("depot.filter.noResults")}</CommandEmpty>
                  <CommandGroup>
                    {categories.map(categoryValue => {
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
                          onSelect={value => {
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
          {filteredProducts.map(product => (
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
                  <Badge variant="secondary" className="mt-1">{product.category}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingProduct(product);
                      setIsDialogOpen(true);
                    }}
                  >
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
                  <span className="font-medium">${product.buy_price.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("depot.price.sell")} </span>
                  <span className="font-medium">${product.sell_price.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjustQuantity(product.id, -1)}
                  disabled={product.quantity <= 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center">
                  <div className="text-2xl font-bold text-foreground">{product.quantity}</div>
                  <div className="text-xs text-muted-foreground">{t("depot.stock")}</div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjustQuantity(product.id, 1)}
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
