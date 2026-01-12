import { useState, useEffect, FormEvent, ChangeEvent, useCallback, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { getDatabase, logPayment, saveDatabase } from "@/lib/db";
import { Product, Customer, CartItem } from "@/types";
import { Plus, Trash2, ShoppingCart, Search, ChevronsUpDown, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "sql.js";
import { useTranslation } from "@/hooks/useTranslation";
import { formatCurrency } from "@/lib/utils";
import { syncMonthlyRestockFromDepot } from "@/lib/shopping";

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [cartSearchQuery, setCartSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"item" | "category">("item");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saleType, setSaleType] = useState<'fully_paid' | 'debt'>('debt');
  const [salesSummary, setSalesSummary] = useState({ total: 0, paid: 0, debt: 0 });
  const [customerSummary, setCustomerSummary] = useState({ total: 0, paid: 0, debt: 0 });
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [isNewCustomerDialogOpen, setIsNewCustomerDialogOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", notes: "" });
  const { t } = useTranslation();

  const loadData = useCallback((nextSelectedCustomerId?: string | null) => {
    const db = getDatabase();

    const prodResult = db.exec('SELECT * FROM products WHERE quantity > 0 ORDER BY name');
    if (prodResult[0]) {
      const prods = prodResult[0].values.map((row) => ({
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
    }

    let resolvedCustomerId: string | null = null;
    const custResult = db.exec('SELECT * FROM customers ORDER BY name');
    if (custResult[0]) {
      const custs = custResult[0].values.map((row) => ({
        id: row[0] as number,
        name: row[1] as string,
        phone: row[2] as string,
        notes: row[3] as string,
        created_at: row[4] as string,
      }));
      setCustomers(custs);
      const desiredCustomerId = nextSelectedCustomerId ?? selectedCustomerId;
      if (custs.length > 0) {
        const matchingCustomer = desiredCustomerId && custs.find(c => c.id === parseInt(desiredCustomerId, 10));
        const chosenCustomer = matchingCustomer ?? custs[0];
        resolvedCustomerId = chosenCustomer.id.toString();
        setSelectedCustomerId(resolvedCustomerId);
      } else {
        setSelectedCustomerId(null);
      }
    } else {
      setCustomers([]);
      setSelectedCustomerId(null);
    }

    updateSalesSummary(db);
    updateCustomerSales(resolvedCustomerId, db);
  }, [selectedCustomerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    updateCustomerSales(selectedCustomerId);
  }, [selectedCustomerId, saleType]);

  useEffect(() => {
    if (searchMode === "item" && selectedCategory) {
      setSelectedCategory(null);
    }
  }, [searchMode, selectedCategory]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    products.forEach((p) => unique.add((p.category ?? "").trim()));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categorySummaries = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      const key = (p.category ?? "").trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return categories.map((category) => ({
      category,
      count: counts.get(category) ?? 0,
    }));
  }, [categories, products]);

  const updateSalesSummary = (database?: Database) => {
    const db = database ?? getDatabase();
    const summaryResult = db.exec(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total,
        COALESCE(SUM(paid_amount), 0) as paid,
        COALESCE(SUM(total_amount - paid_amount), 0) as debt
      FROM transactions
    `);

    if (summaryResult[0]) {
      const [total, paid, debt] = summaryResult[0].values[0] as number[];
      setSalesSummary({ total, paid, debt });
    } else {
      setSalesSummary({ total: 0, paid: 0, debt: 0 });
    }
  };

  const updateCustomerSales = (customerId: string | null, database?: Database) => {
    if (!customerId) {
      setCustomerSummary({ total: 0, paid: 0, debt: 0 });
      return;
    }

    const db = database ?? getDatabase();
    const result = db.exec(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total,
        COALESCE(SUM(paid_amount), 0) as paid,
        COALESCE(SUM(total_amount - paid_amount), 0) as debt
      FROM transactions
      WHERE customer_id = ?
    `, [parseInt(customerId, 10)]);

    if (result[0]) {
      const [total, paid, debt] = result[0].values[0] as number[];
      setCustomerSummary({ total, paid, debt });
    } else {
      setCustomerSummary({ total: 0, paid: 0, debt: 0 });
    }
  };

  const resolveItemUnitPrice = (item: CartItem) => {
    const candidate = Number(item.unitPrice);
    return Number.isFinite(candidate) && candidate >= 0 ? candidate : item.product.sell_price;
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity >= product.quantity) {
        toast.error(t("sales.toast.noStock"));
        return;
      }
      setCart(cart.map(item => 
        item.product.id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1, unitPrice: product.sell_price }]);
    }
    setIsProductDialogOpen(false);
    toast.success(t("sales.toast.added"));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    const product = products.find(p => p.id === productId);
    if (product && quantity > product.quantity) {
      toast.error(t("sales.toast.noStock"));
      return;
    }

    setCart(cart.map(item => 
      item.product.id === productId 
        ? { ...item, quantity }
        : item
    ));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (resolveItemUnitPrice(item) * item.quantity), 0);
  };

  const updateCartPrice = (productId: number, price: number) => {
    if (!Number.isFinite(price) || price < 0) {
      toast.error(t("sales.toast.invalidPrice", { defaultValue: "Enter a valid price" }));
      return;
    }
    setCart(cart.map(item =>
      item.product.id === productId
        ? { ...item, unitPrice: price }
        : item
    ));
  };

  const handleNewCustomerFieldChange = (
    field: 'name' | 'phone' | 'notes'
  ) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setNewCustomerForm(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSelectCustomer = (customerId: number) => {
    setSelectedCustomerId(customerId.toString());
    setIsCustomerPickerOpen(false);
  };

  const handleOpenNewCustomerDialog = () => {
    setIsCustomerPickerOpen(false);
    setIsNewCustomerDialogOpen(true);
  };

  const resetNewCustomerForm = () => {
    setNewCustomerForm({ name: "", phone: "", notes: "" });
  };

  const handleCreateCustomer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newCustomerForm.name.trim()) {
      toast.error(t("sales.toast.nameRequired"));
      return;
    }

    const db = getDatabase();
    try {
      db.run(
        'INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)',
        [
          newCustomerForm.name.trim(),
          newCustomerForm.phone.trim() || null,
          newCustomerForm.notes.trim() || null,
        ]
      );

      const result = db.exec('SELECT last_insert_rowid() as id');
      const newCustomerId = result[0].values[0][0] as number;

      saveDatabase();
      toast.success(t("sales.toast.created"));

      setIsNewCustomerDialogOpen(false);
      resetNewCustomerForm();
      loadData(newCustomerId.toString());
    } catch (error) {
      toast.error(t("sales.toast.createError"));
      console.error(error);
    }
  };

  const completeSale = () => {
    if (cart.length === 0) {
      toast.error(t("sales.toast.empty"));
      return;
    }

    if (!selectedCustomerId) {
      toast.error(t("sales.toast.customerRequired"));
      setIsCustomerPickerOpen(true);
      return;
    }

    const db = getDatabase();
    const total = calculateTotal();
    const customerId = parseInt(selectedCustomerId, 10);
    const customerIdForReload = selectedCustomerId;

    try {
      const paidAmount = saleType === 'fully_paid' ? total : 0;
      db.run(
        'INSERT INTO transactions (customer_id, total_amount, payment_status, paid_amount) VALUES (?, ?, ?, ?)',
        [customerId, total, saleType, paidAmount]
      );

      const result = db.exec('SELECT last_insert_rowid() as id');
      const transactionId = result[0].values[0][0] as number;

      if (paidAmount > 0) {
        logPayment(
          transactionId,
          paidAmount,
          saleType === 'fully_paid'
            ? 'Sale paid in full'
            : 'Initial payment at sale'
        );
      }

      cart.forEach(item => {
        const unitPrice = resolveItemUnitPrice(item);
        const lineTotal = unitPrice * item.quantity;
        
        db.run(
          'INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?)',
          [transactionId, item.product.id, item.quantity, unitPrice, lineTotal]
        );
        
        db.run(
          'UPDATE products SET quantity = quantity - ? WHERE id = ?',
          [item.quantity, item.product.id]
        );
      });

      syncMonthlyRestockFromDepot(db);

      saveDatabase();
      toast.success(t("sales.toast.completed"));

      setCart([]);
      setSaleType('fully_paid');
      loadData(customerIdForReload);
    } catch (error) {
      toast.error(t("sales.toast.failed"));
      console.error(error);
    }
  };

  const normalizedProductQuery = productSearchQuery.trim().toLowerCase();
  const filteredCategories = useMemo(() => {
    return categorySummaries.filter(({ category }) => {
      if (!normalizedProductQuery) return true;
      const label = (category || t("depot.filter.uncategorized", { defaultValue: "Uncategorized" })).toLowerCase();
      return label.includes(normalizedProductQuery);
    });
  }, [categorySummaries, normalizedProductQuery, t]);

  const matchedCategoryFromQuery = searchMode === "category" && normalizedProductQuery
    ? filteredCategories[0]?.category ?? null
    : null;
  const activeCategory = searchMode === "category"
    ? (selectedCategory ?? matchedCategoryFromQuery)
    : null;

  const filteredProducts = products.filter((p) => {
    const nameValue = (p.name ?? "").toLowerCase();
    const barcodeValue = (p.barcode ?? "").toLowerCase();
    const categoryValue = (p.category ?? "").trim();
    const categoryValueLower = categoryValue.toLowerCase();

    const nameMatch = nameValue.includes(normalizedProductQuery);
    const barcodeMatch = barcodeValue.includes(normalizedProductQuery);
    const categoryMatch = activeCategory
      ? categoryValueLower === activeCategory.toLowerCase()
      : normalizedProductQuery
        ? categoryValueLower.includes(normalizedProductQuery)
        : true;

    if (searchMode === "category") {
      if (activeCategory) {
        return categoryMatch;
      }
      if (!normalizedProductQuery) {
        return true;
      }
      return nameMatch || barcodeMatch || categoryMatch;
    }

    // item search
    if (!normalizedProductQuery) {
      return true;
    }
    return nameMatch || barcodeMatch;
  });

  const visibleCartItems = cart.filter(item =>
    cartSearchQuery.trim() === ""
      ? true
      : item.product.name.toLowerCase().includes(cartSearchQuery.toLowerCase()) ||
        item.product.barcode?.toLowerCase().includes(cartSearchQuery.toLowerCase())
  );

  const selectedCustomer = selectedCustomerId
    ? customers.find(c => c.id === parseInt(selectedCustomerId, 10))
    : null;

  return (
    <Layout title={t("sales.title")}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">{t("sales.total")}</div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {formatCurrency(salesSummary.total)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">{t("sales.paid")}</div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {formatCurrency(salesSummary.paid)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">{t("sales.debt")}</div>
            <div className="text-2xl font-bold text-destructive mt-1">
              {formatCurrency(salesSummary.debt)}
            </div>
          </Card>
        </div>

        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground block">{t("sales.customer")}</Label>
            <Popover open={isCustomerPickerOpen} onOpenChange={setIsCustomerPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedCustomer ? selectedCustomer.name : customers.length === 0 ? t("sales.customer.none") : t("sales.customer.select")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[280px] sm:w-[320px]" align="start">
                <Command>
                  <CommandInput placeholder={t("customers.search")} />
                  <CommandList>
                    <CommandEmpty>
                      <div className="p-4 space-y-3 text-center text-sm text-muted-foreground">
                        <p>{t("sales.customer.none")}</p>
                        <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={handleOpenNewCustomerDialog}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          {t("sales.customer.new")}
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup heading={t("customers.title")}>
                      {customers.map(customer => (
                        <CommandItem
                          key={customer.id}
                          value={customer.id.toString()}
                          onSelect={(value) => handleSelectCustomer(parseInt(value, 10))}
                        >
                          <div>
                            <div className="font-medium">{customer.name}</div>
                            {customer.phone && (
                              <div className="text-xs text-muted-foreground">{customer.phone}</div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                  <div className="border-t border-border p-2">
                    <Button variant="ghost" className="w-full justify-start" onClick={handleOpenNewCustomerDialog}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {t("sales.customer.new")}
                    </Button>
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
            {customers.length === 0 && (
              <p className="text-xs text-destructive">
                {t("sales.toast.customerRequired")}
              </p>
            )}
            {customers.length === 0 && (
              <Button size="sm" variant="outline" onClick={handleOpenNewCustomerDialog}>
                <UserPlus className="mr-2 h-4 w-4" />
                {t("sales.customer.new")}
              </Button>
            )}
            {selectedCustomer?.phone && (
              <p className="text-xs text-muted-foreground">{t("sales.newCustomer.phone")}: {selectedCustomer.phone}</p>
            )}
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">{t("sales.saleType")}</Label>
            <Select value={saleType} onValueChange={(value) => setSaleType(value as 'fully_paid' | 'debt')}>
              <SelectTrigger>
                <SelectValue placeholder={t("sales.saleType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fully_paid">{t("sales.saleType.paid")}</SelectItem>
                <SelectItem value="debt" disabled={!selectedCustomerId}>{t("sales.saleType.debt")}</SelectItem>
              </SelectContent>
            </Select>
            {saleType === 'debt' && (
              <p className="text-xs text-muted-foreground mt-2">
                {t("sales.debtNote", { defaultValue: "Debt sales require assigning a customer and will be tracked until fully paid." })}
              </p>
            )}
          </div>

          {selectedCustomer && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">{t("sales.customerTotal", { defaultValue: `${selectedCustomer.name}'s Total`, values: { name: selectedCustomer.name } })}</div>
                <div className="text-lg font-semibold mt-1">
                  {formatCurrency(customerSummary.total)}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">{t("sales.paid")}</div>
                <div className="text-lg font-semibold mt-1">
                  {formatCurrency(customerSummary.paid)}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">{t("sales.debt")}</div>
                <div className="text-lg font-semibold text-destructive mt-1">
                  {formatCurrency(customerSummary.debt)}
                </div>
              </Card>
            </div>
          )}
        </Card>

        <Dialog
          open={isNewCustomerDialogOpen}
          onOpenChange={(open) => {
            setIsNewCustomerDialogOpen(open);
            if (!open) {
              resetNewCustomerForm();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("sales.newCustomer.title")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <Label htmlFor="new-customer-name">{t("sales.newCustomer.name")}</Label>
                <Input
                  id="new-customer-name"
                  value={newCustomerForm.name}
                  onChange={handleNewCustomerFieldChange('name')}
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="new-customer-phone">{t("sales.newCustomer.phone")}</Label>
                <Input
                  id="new-customer-phone"
                  value={newCustomerForm.phone}
                  onChange={handleNewCustomerFieldChange('phone')}
                  type="tel"
                />
              </div>
              <div>
                <Label htmlFor="new-customer-notes">{t("sales.newCustomer.notes")}</Label>
                <Textarea
                  id="new-customer-notes"
                  value={newCustomerForm.notes}
                  onChange={handleNewCustomerFieldChange('notes')}
                  rows={3}
                />
              </div>
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="w-full sm:w-auto">
                    {t("sales.newCustomer.cancel")}
                  </Button>
                </DialogClose>
                <Button type="submit" className="w-full sm:w-auto">
                  {t("sales.newCustomer.submit")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" size="lg">
              <Plus className="h-5 w-5 mr-2" />
              {t("sales.openCatalog")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("sales.openCatalog")}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder={t("sales.searchProducts")}
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (searchMode === "category" && !activeCategory && e.key === "Enter" && filteredCategories.length > 0) {
                    setSelectedCategory(filteredCategories[0].category);
                    e.preventDefault();
                  }
                }}
                className="flex-1"
              />
              <Select value={searchMode} onValueChange={(value) => setSearchMode(value as "item" | "category")}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t("sales.searchMode", { defaultValue: "Search mode" })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="item">{t("sales.searchMode.item", { defaultValue: "Item" })}</SelectItem>
                  <SelectItem value="category">{t("sales.searchMode.category", { defaultValue: "Category" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {searchMode === "category" && !activeCategory ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("sales.searchByCategory", { defaultValue: "Browse by category to narrow the list." })}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredCategories.map(({ category, count }) => (
                    <Card
                      key={category || "uncategorized"}
                      className="p-3 cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => setSelectedCategory(category)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {category || t("depot.filter.uncategorized", { defaultValue: "Uncategorized" })}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {t("sales.itemsCount", { defaultValue: "{count} items", values: { count } })}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
                {filteredCategories.length === 0 && (
                  <Card className="p-4 text-sm text-muted-foreground text-center">
                    {t("sales.noMatches", { defaultValue: "No categories match your search." })}
                  </Card>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  {searchMode === "category" && activeCategory ? (
                    <p className="text-sm text-muted-foreground">
                      {t("sales.filteredCategory", {
                        defaultValue: "Showing category: {category}",
                        values: {
                          category: activeCategory || t("depot.filter.uncategorized", { defaultValue: "Uncategorized" })
                        }
                      })}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("sales.filteredByQuery", { defaultValue: "Filtered by search" })}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory(null);
                      setProductSearchQuery("");
                    }}
                  >
                    {t("sales.clearFilters", { defaultValue: "Clear" })}
                  </Button>
                </div>
                {filteredProducts.map(product => (
                  <Card
                    key={product.id}
                    className="p-3 cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => addToCart(product)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {t("depot.form.category")}: {product.category || t("depot.filter.uncategorized", { defaultValue: "Uncategorized" })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {t("depot.form.quantity")}: {product.quantity} | {t("sales.unitPrice", {
                            defaultValue: "{price} each",
                            values: { price: formatCurrency(product.sell_price) }
                          })}
                        </div>
                      </div>
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                  </Card>
                ))}
                {filteredProducts.length === 0 && (
                  <Card className="p-4 text-sm text-muted-foreground text-center">
                    {t("sales.noMatches", { defaultValue: "No products found for this filter." })}
                  </Card>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("sales.cartSearch")}
              value={cartSearchQuery}
              onChange={(e) => setCartSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {visibleCartItems.map(item => (
            <Card key={item.product.id} className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold">{item.product.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("sales.unitPrice", {
                      defaultValue: `${formatCurrency(resolveItemUnitPrice(item))} each`,
                      values: { price: formatCurrency(resolveItemUnitPrice(item)) }
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFromCart(item.product.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateCartQuantity(item.product.id, parseInt(e.target.value) || 0)}
                    className="w-20 text-center"
                    min="1"
                    max={item.product.quantity}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                  >
                    +
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("sales.priceLabel", { defaultValue: "Price" })}</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={resolveItemUnitPrice(item)}
                    onChange={(e) => updateCartPrice(item.product.id, parseFloat(e.target.value))}
                    className="w-24 text-center"
                  />
                </div>

                <div className="ml-auto text-right w-full sm:w-auto">
                  <div className="font-bold text-lg">
                    {formatCurrency(resolveItemUnitPrice(item) * item.quantity)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {cart.length > 0 && visibleCartItems.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground">
              {t("sales.noMatches", { defaultValue: "No cart items match your search." })}
            </Card>
          )}
        </div>

        {cart.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t("sales.noItems")}</p>
          </div>
        )}

        {cart.length > 0 && (
          <Card className="p-6 sticky bottom-20 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xl font-bold">{t("sales.total")}</span>
              <span className="text-3xl font-bold text-primary">
                {formatCurrency(calculateTotal())}
              </span>
            </div>
            <Button onClick={completeSale} className="w-full" size="lg">
              {t("sales.complete")}
            </Button>
          </Card>
        )}
      </div>
    </Layout>
  );
}


