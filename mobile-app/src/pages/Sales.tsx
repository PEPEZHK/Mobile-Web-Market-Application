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
import {
  createSaleTransaction,
  DatabaseOperationError,
  getCustomerById,
  getDatabase,
  getFirstCustomer,
  listProducts,
  logPayment,
  saveDatabase,
  searchCustomers,
} from "@/lib/db";
import { formatQuantityWithUnit, getQuantityInputStep, getQuantityStep } from "@/lib/units";
import { Product, Customer, CartItem } from "@/types";
import { Plus, Trash2, ShoppingCart, Search, ChevronsUpDown, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "sql.js";
import { useTranslation } from "@/hooks/useTranslation";
import { formatCurrency } from "@/lib/utils";
import { syncMonthlyRestockFromDepot } from "@/lib/shopping";

const STOCK_EPSILON = 0.000001;

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [hasCustomers, setHasCustomers] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [cartSearchQuery, setCartSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"item" | "category">("item");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saleType, setSaleType] = useState<"fully_paid" | "debt">("debt");
  const [salesSummary, setSalesSummary] = useState({ total: 0, paid: 0, debt: 0 });
  const [customerSummary, setCustomerSummary] = useState({ total: 0, paid: 0, debt: 0 });
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [isNewCustomerDialogOpen, setIsNewCustomerDialogOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", notes: "" });
  const { t } = useTranslation();

  const loadCustomerResults = useCallback((query: string) => {
    setCustomerResults(searchCustomers(query, 50));
  }, []);

  const updateSalesSummary = useCallback((database?: Database) => {
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
  }, []);

  const updateCustomerSales = useCallback((customerId: string | null, database?: Database) => {
    if (!customerId) {
      setCustomerSummary({ total: 0, paid: 0, debt: 0 });
      return;
    }

    const db = database ?? getDatabase();
    const result = db.exec(
      `
        SELECT
          COALESCE(SUM(total_amount), 0) as total,
          COALESCE(SUM(paid_amount), 0) as paid,
          COALESCE(SUM(total_amount - paid_amount), 0) as debt
        FROM transactions
        WHERE customer_id = ?
      `,
      [Number.parseInt(customerId, 10)],
    );

    if (result[0]) {
      const [total, paid, debt] = result[0].values[0] as number[];
      setCustomerSummary({ total, paid, debt });
    } else {
      setCustomerSummary({ total: 0, paid: 0, debt: 0 });
    }
  }, []);

  const loadData = useCallback((nextSelectedCustomerId?: string | null) => {
    const db = getDatabase();
    setProducts(listProducts({ inStockOnly: true }));

    const fallbackCustomer = getFirstCustomer();
    const desiredCustomerId = nextSelectedCustomerId ?? selectedCustomerId;
    const resolvedCustomer = desiredCustomerId
      ? getCustomerById(Number.parseInt(desiredCustomerId, 10))
      : fallbackCustomer;

    setHasCustomers(Boolean(fallbackCustomer));
    setSelectedCustomer(resolvedCustomer ?? null);
    setSelectedCustomerId(resolvedCustomer ? resolvedCustomer.id.toString() : null);
    updateSalesSummary(db);
    updateCustomerSales(resolvedCustomer ? resolvedCustomer.id.toString() : null, db);
    loadCustomerResults(customerSearchQuery);
  }, [customerSearchQuery, loadCustomerResults, selectedCustomerId, updateCustomerSales, updateSalesSummary]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedCustomerId && saleType === "debt") {
      setSaleType("fully_paid");
    }
  }, [saleType, selectedCustomerId]);

  useEffect(() => {
    if (isCustomerPickerOpen) {
      loadCustomerResults(customerSearchQuery);
    }
  }, [customerSearchQuery, isCustomerPickerOpen, loadCustomerResults]);

  useEffect(() => {
    if (searchMode === "item" && selectedCategory) {
      setSelectedCategory(null);
    }
  }, [searchMode, selectedCategory]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    products.forEach((product) => unique.add((product.category ?? "").trim()));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categorySummaries = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      const key = (product.category ?? "").trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return categories.map((category) => ({
      category,
      count: counts.get(category) ?? 0,
    }));
  }, [categories, products]);

  const resolveItemUnitPrice = (item: CartItem) => {
    const candidate = Number(item.unitPrice);
    return Number.isFinite(candidate) && candidate >= 0 ? candidate : item.product.sell_price;
  };

  const addToCart = (product: Product) => {
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      const nextQuantity = existing.quantity + getQuantityStep(product.unit);
      if (nextQuantity - product.quantity > STOCK_EPSILON) {
        toast.error(t("sales.toast.noStock"));
        return;
      }
      setCart(
        cart.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: product.unit === "metr"
                  ? Math.round(nextQuantity * 100) / 100
                  : Math.round(nextQuantity),
              }
            : item,
        ),
      );
    } else {
      const initialQuantity = product.unit === "metr" ? Math.min(product.quantity, 1) : 1;
      if (initialQuantity <= 0) {
        toast.error(t("sales.toast.noStock"));
        return;
      }
      setCart([...cart, { product, quantity: initialQuantity, unitPrice: product.sell_price }]);
    }

    setIsProductDialogOpen(false);
    toast.success(t("sales.toast.added"));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: number, quantity: number) => {
    const product = products.find((entry) => entry.id === productId);
    if (!product) {
      return;
    }

    const normalizedQuantity = product.unit === "metr"
      ? Math.round(quantity * 100) / 100
      : Math.round(quantity);

    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    if (normalizedQuantity - product.quantity > STOCK_EPSILON) {
      toast.error(t("sales.toast.noStock"));
      return;
    }

    setCart(
      cart.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: normalizedQuantity }
          : item,
      ),
    );
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (resolveItemUnitPrice(item) * item.quantity), 0);
  };

  const updateCartPrice = (productId: number, price: number) => {
    if (!Number.isFinite(price) || price < 0) {
      toast.error(t("sales.toast.invalidPrice", { defaultValue: "Enter a valid price" }));
      return;
    }
    setCart(
      cart.map((item) =>
        item.product.id === productId
          ? { ...item, unitPrice: price }
          : item,
      ),
    );
  };

  const handleNewCustomerFieldChange =
    (field: "name" | "phone" | "notes") =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setNewCustomerForm((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  const handleSelectCustomer = (customerId: number) => {
    const customer = getCustomerById(customerId);
    setSelectedCustomer(customer);
    setSelectedCustomerId(customer ? customer.id.toString() : null);
    setIsCustomerPickerOpen(false);
    updateCustomerSales(customer ? customer.id.toString() : null);
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
        "INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)",
        [
          newCustomerForm.name.trim(),
          newCustomerForm.phone.trim() || null,
          newCustomerForm.notes.trim() || null,
        ],
      );

      const result = db.exec("SELECT last_insert_rowid() as id");
      const newCustomerId = Number(result[0]?.values?.[0]?.[0] ?? 0);

      saveDatabase();
      toast.success(t("sales.toast.created"));

      setIsNewCustomerDialogOpen(false);
      setCustomerSearchQuery("");
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

    try {
      const transactionId = createSaleTransaction({
        customerId: Number.parseInt(selectedCustomerId, 10),
        paymentStatus: saleType,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: resolveItemUnitPrice(item),
        })),
      });

      if (saleType === "fully_paid") {
        logPayment(transactionId, calculateTotal(), "Sale paid in full");
      }

      syncMonthlyRestockFromDepot(getDatabase());
      saveDatabase();
      toast.success(t("sales.toast.completed"));

      setCart([]);
      setSaleType("fully_paid");
      loadData(selectedCustomerId);
    } catch (error) {
      if (error instanceof DatabaseOperationError && error.code === "insufficient_stock") {
        toast.error(t("sales.toast.noStock"));
      } else {
        toast.error(t("sales.toast.failed"));
      }
      console.error(error);
    }
  };

  const normalizedProductQuery = productSearchQuery.trim().toLowerCase();
  const filteredCategories = useMemo(() => {
    return categorySummaries.filter(({ category }) => {
      if (!normalizedProductQuery) {
        return true;
      }
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

  const filteredProducts = products.filter((product) => {
    const nameValue = (product.name ?? "").toLowerCase();
    const barcodeValue = (product.barcode ?? "").toLowerCase();
    const categoryValue = (product.category ?? "").trim();
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

    if (!normalizedProductQuery) {
      return true;
    }

    return nameMatch || barcodeMatch;
  });

  const visibleCartItems = cart.filter((item) =>
    cartSearchQuery.trim() === ""
      ? true
      : item.product.name.toLowerCase().includes(cartSearchQuery.toLowerCase()) ||
        item.product.barcode?.toLowerCase().includes(cartSearchQuery.toLowerCase()),
  );

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
                  {selectedCustomer
                    ? selectedCustomer.name
                    : !hasCustomers
                      ? t("sales.customer.none")
                      : t("sales.customer.select")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[280px] sm:w-[320px]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t("customers.search")}
                    value={customerSearchQuery}
                    onValueChange={setCustomerSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <div className="p-4 space-y-3 text-center text-sm text-muted-foreground">
                        <p>{t("sales.customer.none")}</p>
                        <Button size="sm" onMouseDown={(event) => event.preventDefault()} onClick={handleOpenNewCustomerDialog}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          {t("sales.customer.new")}
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup heading={t("customers.title")}>
                      {customerResults.map((customer) => (
                        <CommandItem
                          key={customer.id}
                          value={`${customer.name} ${customer.phone ?? ""}`}
                          onSelect={() => handleSelectCustomer(customer.id)}
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
            {!hasCustomers && (
              <p className="text-xs text-destructive">
                {t("sales.toast.customerRequired")}
              </p>
            )}
            {!hasCustomers && (
              <Button size="sm" variant="outline" onClick={handleOpenNewCustomerDialog}>
                <UserPlus className="mr-2 h-4 w-4" />
                {t("sales.customer.new")}
              </Button>
            )}
            {selectedCustomer?.phone && (
              <p className="text-xs text-muted-foreground">
                {t("sales.newCustomer.phone")}: {selectedCustomer.phone}
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">{t("sales.saleType")}</Label>
            <Select value={saleType} onValueChange={(value) => setSaleType(value as "fully_paid" | "debt")}>
              <SelectTrigger>
                <SelectValue placeholder={t("sales.saleType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fully_paid">{t("sales.saleType.paid")}</SelectItem>
                <SelectItem value="debt" disabled={!selectedCustomerId}>{t("sales.saleType.debt")}</SelectItem>
              </SelectContent>
            </Select>
            {saleType === "debt" && (
              <p className="text-xs text-muted-foreground mt-2">
                {t("sales.debtNote", { defaultValue: "Debt sales require assigning a customer and will be tracked until fully paid." })}
              </p>
            )}
          </div>

          {selectedCustomer && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">
                  {t("sales.customerTotal", { defaultValue: `${selectedCustomer.name}'s Total`, values: { name: selectedCustomer.name } })}
                </div>
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
                  onChange={handleNewCustomerFieldChange("name")}
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="new-customer-phone">{t("sales.newCustomer.phone")}</Label>
                <Input
                  id="new-customer-phone"
                  value={newCustomerForm.phone}
                  onChange={handleNewCustomerFieldChange("phone")}
                  type="tel"
                />
              </div>
              <div>
                <Label htmlFor="new-customer-notes">{t("sales.newCustomer.notes")}</Label>
                <Textarea
                  id="new-customer-notes"
                  value={newCustomerForm.notes}
                  onChange={handleNewCustomerFieldChange("notes")}
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
                onChange={(event) => setProductSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (searchMode === "category" && !activeCategory && event.key === "Enter" && filteredCategories.length > 0) {
                    setSelectedCategory(filteredCategories[0].category);
                    event.preventDefault();
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
                          category: activeCategory || t("depot.filter.uncategorized", { defaultValue: "Uncategorized" }),
                        },
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
                {filteredProducts.map((product) => (
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
                          {t("depot.form.quantity")}: {formatQuantityWithUnit(product.quantity, product.unit, t)} | {t("sales.unitPrice", {
                            defaultValue: "{price} each",
                            values: { price: formatCurrency(product.sell_price) },
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
              onChange={(event) => setCartSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>

          {visibleCartItems.map((item) => (
            <Card key={item.product.id} className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold">{item.product.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("sales.unitPrice", {
                      defaultValue: `${formatCurrency(resolveItemUnitPrice(item))} each`,
                      values: { price: formatCurrency(resolveItemUnitPrice(item)) },
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("depot.form.quantity")}: {formatQuantityWithUnit(item.product.quantity, item.product.unit, t)}
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
                    onClick={() => updateCartQuantity(item.product.id, item.quantity - getQuantityStep(item.product.unit))}
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(event) => updateCartQuantity(item.product.id, Number(event.target.value) || 0)}
                    className="w-20 text-center"
                    min={item.product.unit === "metr" ? "0.01" : "1"}
                    max={item.product.quantity}
                    step={getQuantityInputStep(item.product.unit)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateCartQuantity(item.product.id, item.quantity + getQuantityStep(item.product.unit))}
                  >
                    +
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {formatQuantityWithUnit(item.quantity, item.product.unit, t, "short")}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("sales.priceLabel", { defaultValue: "Price" })}</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={resolveItemUnitPrice(item)}
                    onChange={(event) => updateCartPrice(item.product.id, parseFloat(event.target.value))}
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
