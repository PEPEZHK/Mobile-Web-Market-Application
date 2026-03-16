import { useState, useEffect, useMemo, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DatabaseOperationError,
  deleteTransaction,
  getDatabase,
  getTransactionsWithDetails,
  listProducts,
  saveDatabase,
  updateTransactionItems,
  type TransactionWithDetails,
} from "@/lib/db";
import { endOfDay, endOfMonth, endOfWeek, endOfYear, format, parseISO, startOfDay, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { Receipt, Search, Download, Pencil, Trash2, Plus } from "lucide-react";
import { exportSheetsAsExcel } from "@/lib/export-excel";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/hooks/useTranslation";
import { formatCurrency } from "@/lib/utils";
import { formatQuantityWithUnit, getQuantityInputStep, getQuantityStep, getUnitLabel } from "@/lib/units";
import { Product } from "@/types";
import { syncMonthlyRestockFromDepot } from "@/lib/shopping";

interface PaymentLogEntry {
  id: number;
  transaction_id: number;
  amount: number;
  created_at: string;
  customer_name: string | null;
}

interface EditableTransactionItem {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  availableStock: number;
  unit: Product["unit"];
}

export default function History() {
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLogEntry[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editItems, setEditItems] = useState<EditableTransactionItem[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [editProductSearchQuery, setEditProductSearchQuery] = useState("");
  const [summaryPeriod, setSummaryPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [selectedDay, setSelectedDay] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    const weekNumber = format(now, "II");
    return `${format(now, "yyyy")}-W${weekNumber}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [selectedYear, setSelectedYear] = useState(() => format(new Date(), "yyyy"));
  const { t } = useTranslation();

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
      }),
    [],
  );

  const loadTransactions = useCallback((selectedId?: number | null) => {
    const nextTransactions = getTransactionsWithDetails();
    setTransactions(nextTransactions);

    if (selectedId) {
      setSelectedTransaction(nextTransactions.find((transaction) => transaction.id === selectedId) ?? null);
    }

    const db = getDatabase();
    const logsResult = db.exec(`
      SELECT pl.id, pl.transaction_id, pl.amount, pl.created_at, c.name
      FROM payment_logs pl
      LEFT JOIN transactions t ON pl.transaction_id = t.id
      LEFT JOIN customers c ON t.customer_id = c.id
      ORDER BY datetime(pl.created_at) DESC
    `);

    const logs: PaymentLogEntry[] = logsResult[0]
      ? logsResult[0].values.map((row) => ({
          id: row[0] as number,
          transaction_id: row[1] as number,
          amount: Number(row[2] ?? 0),
          created_at: row[3] as string,
          customer_name: row[4] ? (row[4] as string) : null,
        }))
      : [];

    setPaymentLogs(logs);
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const filteredTransactions = transactions.filter((transaction) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery === "") {
      return true;
    }

    const transactionLabel = `transaction #${transaction.id}`.toLowerCase();
    const alternateLabel = `transaction ${transaction.id}`.toLowerCase();
    const customerName = transaction.customer_name?.toLowerCase() ?? "";
    const transactionItems = transaction.items.map((item) => item.product_name.toLowerCase());

    return (
      transactionLabel.includes(normalizedQuery) ||
      transaction.id.toString().includes(normalizedQuery) ||
      alternateLabel.includes(normalizedQuery) ||
      customerName.includes(normalizedQuery) ||
      transactionItems.some((itemName) => itemName.includes(normalizedQuery))
    );
  });

  const noTransactions = transactions.length === 0;
  const noResults = !noTransactions && filteredTransactions.length === 0;

  const toExcelFilename = (requestedName: string | null | undefined, fallback: string) => {
    const trimmed = requestedName?.trim();
    if (!trimmed) {
      return fallback;
    }
    if (trimmed.toLowerCase().endsWith(".xlsx")) {
      return trimmed;
    }
    return `${trimmed.replace(/\.json$/i, "").replace(/\.xls$/i, "")}.xlsx`;
  };

  const exportHistoryToExcel = async () => {
    if (filteredTransactions.length === 0) {
      toast.error(t("history.toast.noExport"));
      return;
    }

    const rows: Array<Array<string | number>> = [[
      t("customers.export.columns.transactionId"),
      t("customers.export.columns.date"),
      t("customers.export.columns.customer"),
      t("customers.export.columns.status"),
      t("customers.export.columns.item"),
      t("customers.export.columns.quantity"),
      t("common.unit"),
      t("customers.export.columns.unitPrice"),
      t("customers.export.columns.lineTotal"),
      t("customers.export.columns.transactionTotal"),
    ]];

    filteredTransactions.forEach((transaction) => {
      if (transaction.items.length === 0) {
        rows.push([
          transaction.id,
          format(new Date(transaction.date), "yyyy-MM-dd HH:mm"),
          transaction.customer_name ?? "-",
          transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
          "-",
          "-",
          "-",
          "-",
          "-",
          transaction.total_amount,
        ]);
        return;
      }

      transaction.items.forEach((item) => {
        rows.push([
          transaction.id,
          format(new Date(transaction.date), "yyyy-MM-dd HH:mm"),
          transaction.customer_name ?? "-",
          transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
          item.product_name,
          item.quantity,
          getUnitLabel(item.unit, t, "short"),
          item.unit_price,
          item.line_total,
          transaction.total_amount,
        ]);
      });
    });

    const defaultName = `${t("history.export.filename")}.xlsx`;
    const requestedName = window.prompt(
      t("history.export.filenamePrompt", { defaultValue: "Choose file name" }),
      defaultName,
    );
    const finalName = toExcelFilename(requestedName, defaultName);

    await exportSheetsAsExcel(finalName, [
      { name: t("history.export.transactionsSheet"), rows },
    ]);
  };

  const computeRange = () => {
    if (summaryPeriod === "day") {
      const day = parseISO(selectedDay);
      if (Number.isNaN(day.getTime())) {
        return null;
      }
      return {
        start: startOfDay(day),
        end: endOfDay(day),
        filename: `${selectedDay}.xlsx`,
        label: format(day, "PPP"),
      };
    }

    if (summaryPeriod === "week") {
      const [yearPart, weekPart] = selectedWeek.split("-W");
      const weekNumber = Number.parseInt(weekPart ?? "1", 10) || 1;
      const yearNumber = Number(yearPart);
      if (!yearPart || Number.isNaN(yearNumber) || yearNumber <= 0) {
        return null;
      }
      const baseDate = new Date(yearNumber, 0, 1 + (weekNumber - 1) * 7);
      if (Number.isNaN(baseDate.getTime())) {
        return null;
      }
      const start = startOfWeek(baseDate, { weekStartsOn: 1 });
      const end = endOfWeek(start, { weekStartsOn: 1 });
      const filename = `${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}-summary.xlsx`;
      const label = `${format(start, "PPP")} - ${format(end, "PPP")}`;
      return { start, end, filename, label };
    }

    if (summaryPeriod === "month") {
      const monthDate = parseISO(`${selectedMonth}-01`);
      if (Number.isNaN(monthDate.getTime())) {
        return null;
      }
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      return {
        start,
        end,
        filename: `${format(start, "yyyy-MM")}-summary.xlsx`,
        label: format(start, "LLLL yyyy"),
      };
    }

    const yearDate = parseISO(`${selectedYear}-01-01`);
    if (Number.isNaN(yearDate.getTime())) {
      return null;
    }
    const start = startOfYear(yearDate);
    const end = endOfYear(yearDate);
    return {
      start,
      end,
      filename: `${format(start, "yyyy")}-summary.xlsx`,
      label: format(start, "yyyy"),
    };
  };

  const exportSummary = async () => {
    const computed = computeRange();
    if (!computed) {
      toast.error(t("history.toast.invalidPeriod"));
      return;
    }

    const { start, end, filename, label } = computed;
    const requestedName = window.prompt(
      t("history.export.filenamePrompt", { defaultValue: "Choose file name" }),
      filename,
    );
    const finalFilename = toExcelFilename(requestedName, filename);

    const summaryTransactions = transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= start && transactionDate <= end;
    });

    const summaryPayments = paymentLogs.filter((log) => {
      const logDate = new Date(log.created_at);
      return logDate >= start && logDate <= end;
    });

    if (summaryTransactions.length === 0) {
      toast.error(t("history.toast.noPeriodTransactions"));
      return;
    }

    const totalAmount = summaryTransactions.reduce((sum, transaction) => sum + transaction.total_amount, 0);
    const paidAmount = summaryTransactions.reduce((sum, transaction) => sum + (transaction.paid_amount ?? 0), 0);
    const debtAmount = summaryTransactions.reduce((sum, transaction) => sum + transaction.outstanding, 0);

    const overviewRows: Array<Array<string | number>> = [
      [t("history.summary.period"), label],
      [t("history.summary.start"), format(start, "yyyy-MM-dd HH:mm")],
      [t("history.summary.end"), format(end, "yyyy-MM-dd HH:mm")],
      [],
      [t("customers.export.columns.totalTransactions"), summaryTransactions.length],
      [t("history.summary.totalAmount"), totalAmount],
      [t("customers.export.columns.fullyPaid"), paidAmount],
      [t("customers.export.columns.outstandingDebt"), debtAmount],
      [],
      [
        t("history.summary.table.date"),
        t("customers.export.columns.customer"),
        t("history.summary.table.saleType"),
        t("customers.export.columns.transactionTotal"),
        t("history.summary.table.items"),
      ],
      ...summaryTransactions.map((transaction) => {
        const transactionDate = format(new Date(transaction.date), "yyyy-MM-dd HH:mm");
        const saleType = transaction.payment_status === "debt"
          ? t("customers.status.debt")
          : t("customers.status.paid");
        const itemsDescription = transaction.items.length > 0
          ? transaction.items
              .map((item) => `${item.product_name} (${formatQuantityWithUnit(item.quantity, item.unit, t, "short")} x ${formatCurrency(item.line_total)})`)
              .join("; ")
          : t("history.detail.noItems");

        return [
          transactionDate,
          transaction.customer_name ?? "-",
          saleType,
          Number(transaction.total_amount.toFixed(2)),
          itemsDescription,
        ];
      }),
    ];

    const detailRows: Array<Array<string | number>> = [[
      t("customers.export.columns.transactionId"),
      t("customers.export.columns.date"),
      t("customers.export.columns.customer"),
      t("customers.export.columns.status"),
      t("customers.export.columns.item"),
      t("customers.export.columns.quantity"),
      t("common.unit"),
      t("customers.export.columns.unitPrice"),
      t("customers.export.columns.lineTotal"),
      t("customers.export.columns.transactionTotal"),
    ]];

    summaryTransactions.forEach((transaction) => {
      const transactionDate = format(new Date(transaction.date), "yyyy-MM-dd HH:mm");
      if (transaction.items.length === 0) {
        detailRows.push([
          transaction.id,
          transactionDate,
          transaction.customer_name ?? "-",
          transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
          "-",
          "-",
          "-",
          "-",
          "-",
          transaction.total_amount,
        ]);
        return;
      }

      transaction.items.forEach((item) => {
        detailRows.push([
          transaction.id,
          transactionDate,
          transaction.customer_name ?? "-",
          transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
          item.product_name,
          item.quantity,
          getUnitLabel(item.unit, t, "short"),
          item.unit_price,
          item.line_total,
          transaction.total_amount,
        ]);
      });
    });

    const logEntries = [
      ...summaryTransactions.map((transaction) => ({
        date: new Date(transaction.date),
        customer: transaction.customer_name ?? "-",
        type: transaction.payment_status === "debt"
          ? t("history.log.saleDebt", { defaultValue: "Sale (Debt)" })
          : t("history.log.salePaid", { defaultValue: "Sale (Paid)" }),
        total: transaction.total_amount,
        items: transaction.items.length > 0
          ? transaction.items
              .map((item) => `${item.product_name} (${formatQuantityWithUnit(item.quantity, item.unit, t, "short")} x ${formatCurrency(item.line_total)})`)
              .join("; ")
          : t("history.detail.noItems"),
      })),
      ...summaryPayments.map((log) => ({
        date: new Date(log.created_at),
        customer: log.customer_name ?? "-",
        type: log.amount >= 0
          ? t("history.log.payment", { defaultValue: "Payment" })
          : t("history.log.adjustment", { defaultValue: "Adjustment" }),
        total: log.amount,
        items: t("history.log.paymentNote", {
          defaultValue: `Payment for transaction #${log.transaction_id}`,
          values: { id: log.transaction_id },
        }),
      })),
    ];

    const logRows: Array<Array<string | number>> = [[
      t("history.log.columns.time", { defaultValue: "Time" }),
      t("history.log.columns.customer", { defaultValue: "Customer" }),
      t("history.log.columns.type", { defaultValue: "Type" }),
      t("history.log.columns.total", { defaultValue: "Total" }),
      t("history.log.columns.items", { defaultValue: "Items / Note" }),
    ]];

    logEntries
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .forEach((entry) => {
        logRows.push([
          format(entry.date, "yyyy-MM-dd HH:mm"),
          entry.customer,
          entry.type,
          Number(entry.total.toFixed(2)),
          entry.items,
        ]);
      });

    await exportSheetsAsExcel(finalFilename, [
      { name: t("history.export.summarySheet"), rows: overviewRows },
      { name: t("history.export.transactionsSheet"), rows: detailRows },
      { name: t("history.export.logSheet", { defaultValue: "Log" }), rows: logRows },
    ]);

    toast.success(t("history.toast.summaryExported"));
    setIsSummaryDialogOpen(false);
  };

  const beginEditTransaction = () => {
    if (!selectedTransaction) {
      return;
    }

    const currentProducts = listProducts();
    const productsById = new Map(currentProducts.map((product) => [product.id, product]));
    const missingProduct = selectedTransaction.items.find((item) => !productsById.has(item.product_id));

    if (missingProduct) {
      toast.error(t("history.toast.editMissingProduct"));
      return;
    }

    setAvailableProducts(currentProducts);
    setEditItems(
      selectedTransaction.items.map((item) => {
        const product = productsById.get(item.product_id)!;
        return {
          productId: item.product_id,
          name: item.product_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          availableStock: product.quantity + item.quantity,
          unit: item.unit,
        };
      }),
    );
    setEditProductSearchQuery("");
    setIsEditDialogOpen(true);
  };

  const updateEditableItemQuantity = (productId: number, quantity: number) => {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) {
          return item;
        }

        const normalizedQuantity = item.unit === "metr"
          ? Math.round(quantity * 100) / 100
          : Math.round(quantity);

        return {
          ...item,
          quantity: normalizedQuantity,
        };
      }),
    );
  };

  const removeEditableItem = (productId: number) => {
    setEditItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const addEditableProduct = (product: Product) => {
    if (editItems.some((item) => item.productId === product.id)) {
      return;
    }

    const initialQuantity = product.unit === "metr" ? Math.min(product.quantity, 1) : 1;
    if (initialQuantity <= 0) {
      toast.error(t("sales.toast.noStock"));
      return;
    }

    setEditItems((prev) => [
      ...prev,
      {
        productId: product.id,
        name: product.name,
        quantity: initialQuantity,
        unitPrice: product.sell_price,
        availableStock: product.quantity,
        unit: product.unit,
      },
    ]);
  };

  const handleSaveTransactionEdit = () => {
    if (!selectedTransaction) {
      return;
    }

    const validItems = editItems.filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error(t("history.toast.emptyEdit"));
      return;
    }

    try {
      updateTransactionItems(
        selectedTransaction.id,
        validItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      );
      syncMonthlyRestockFromDepot(getDatabase());
      saveDatabase();
      loadTransactions(selectedTransaction.id);
      setIsEditDialogOpen(false);
      toast.success(t("history.toast.updated"));
    } catch (error) {
      if (error instanceof DatabaseOperationError && error.code === "insufficient_stock") {
        toast.error(t("history.toast.updateStockError", { values: { name: String(error.details.productName ?? "") } }));
      } else if (error instanceof DatabaseOperationError && error.code === "product_not_found") {
        toast.error(t("history.toast.editMissingProduct"));
      } else {
        toast.error(t("history.toast.updateError"));
      }
      console.error(error);
    }
  };

  const handleDeleteSelectedTransaction = () => {
    if (!selectedTransaction) {
      return;
    }

    const confirmed = window.confirm(
      t("history.confirm.delete", { values: { id: selectedTransaction.id } }),
    );
    if (!confirmed) {
      return;
    }

    try {
      deleteTransaction(selectedTransaction.id);
      syncMonthlyRestockFromDepot(getDatabase());
      saveDatabase();
      setSelectedTransaction(null);
      setIsEditDialogOpen(false);
      loadTransactions();
      toast.success(t("history.toast.deleted"));
    } catch (error) {
      toast.error(t("history.toast.deleteError"));
      console.error(error);
    }
  };

  const filteredEditProducts = availableProducts.filter((product) => {
    if (editItems.some((item) => item.productId === product.id)) {
      return false;
    }

    const normalizedQuery = editProductSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return product.quantity > 0;
    }

    return (
      product.quantity > 0 &&
      (product.name.toLowerCase().includes(normalizedQuery) ||
        product.barcode.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery))
    );
  });

  return (
    <Layout title={t("history.title")}>
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative sm:max-w-xs flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("history.search")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2">
            <Button variant="outline" onClick={exportHistoryToExcel} className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" />
              {t("history.export.all")}
            </Button>
            <Button onClick={() => setIsSummaryDialogOpen(true)} className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" />
              {t("history.export.summary")}
            </Button>
          </div>
        </div>

        <Dialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("history.summary.title")}</DialogTitle>
              <p className="text-sm text-muted-foreground">{t("history.summary.description")}</p>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{t("history.summary.periodLabel")}</Label>
                <Select value={summaryPeriod} onValueChange={(value) => setSummaryPeriod(value as typeof summaryPeriod)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("history.summary.periodPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">{t("history.summary.period.day")}</SelectItem>
                    <SelectItem value="week">{t("history.summary.period.week")}</SelectItem>
                    <SelectItem value="month">{t("history.summary.period.month")}</SelectItem>
                    <SelectItem value="year">{t("history.summary.period.year")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {summaryPeriod === "day" && (
                  <Input
                    type="date"
                    value={selectedDay}
                    onChange={(event) => setSelectedDay(event.target.value)}
                    aria-label={t("history.summary.dayLabel")}
                  />
                )}
                {summaryPeriod === "week" && (
                  <Input
                    type="week"
                    value={selectedWeek}
                    onChange={(event) => setSelectedWeek(event.target.value)}
                    aria-label={t("history.summary.weekLabel")}
                  />
                )}
                {summaryPeriod === "month" && (
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    aria-label={t("history.summary.monthLabel")}
                  />
                )}
                {summaryPeriod === "year" && (
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(event.target.value)}
                    aria-label={t("history.summary.yearLabel")}
                  />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {(() => {
                  const preview = computeRange();
                  return preview
                    ? `${t("history.summary.preview", { defaultValue: "Range" })}: ${preview.label}`
                    : t("history.summary.previewInvalid", { defaultValue: "Select a valid period" });
                })()}
              </div>

              <Separator />

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsSummaryDialogOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={exportSummary}>{t("history.export.summary")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {filteredTransactions.map((transaction) => (
          <Card
            key={transaction.id}
            className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedTransaction(transaction)}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-foreground">
                    {t("history.transactionNumber", { values: { id: transaction.id } })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {format(new Date(transaction.date), "MMM dd, yyyy • HH:mm")}
                </p>
              </div>
              <div className="text-right space-y-2">
                <div className="text-xl font-bold text-primary">
                  {currencyFormatter.format(transaction.total_amount)}
                </div>
                <Badge variant={transaction.payment_status === "debt" ? "destructive" : "secondary"}>
                  {transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid")}
                </Badge>
              </div>
            </div>

            {transaction.customer_name && (
              <Badge variant="secondary" className="mt-2">
                {transaction.customer_name}
              </Badge>
            )}

            <div className="text-sm text-muted-foreground mt-2">
              {t("history.transactionItemsCount", { values: { count: transaction.items.length } })}
            </div>
          </Card>
        ))}

        <Dialog open={selectedTransaction !== null} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedTransaction
                  ? t("history.transactionNumber", { values: { id: selectedTransaction.id } })
                  : t("history.title")}
              </DialogTitle>
            </DialogHeader>

            {selectedTransaction && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {format(new Date(selectedTransaction.date), "MMMM dd, yyyy • HH:mm")}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant={selectedTransaction.payment_status === "debt" ? "destructive" : "secondary"}>
                    {selectedTransaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid")}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={beginEditTransaction}>
                    <Pencil className="h-4 w-4 mr-2" />
                    {t("history.actions.edit")}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDeleteSelectedTransaction}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("history.actions.delete")}
                  </Button>
                </div>

                {selectedTransaction.customer_name && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">{t("history.detail.customer")}</div>
                    <div className="font-medium">{selectedTransaction.customer_name}</div>
                  </div>
                )}

                <div>
                  <div className="text-sm text-muted-foreground mb-2">{t("history.detail.itemsTitle")}</div>
                  {selectedTransaction.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("customers.export.columns.item")}</TableHead>
                          <TableHead className="text-right">{t("customers.export.columns.quantity")}</TableHead>
                          <TableHead className="text-right">{t("customers.export.columns.unitPrice")}</TableHead>
                          <TableHead className="text-right">{t("customers.export.columns.lineTotal")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTransaction.items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell className="text-right">{formatQuantityWithUnit(item.quantity, item.unit, t, "short")}</TableCell>
                            <TableCell className="text-right">{currencyFormatter.format(item.unit_price)}</TableCell>
                            <TableCell className="text-right font-semibold">{currencyFormatter.format(item.line_total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={3} className="text-right font-medium">{t("history.detail.itemsSubtotal")}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {currencyFormatter.format(selectedTransaction.items.reduce((sum, item) => sum + item.line_total, 0))}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("history.detail.noItems")}</p>
                  )}
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold">{t("customers.export.columns.transactionTotal")}</span>
                    <span className="text-2xl font-bold text-primary">
                      {currencyFormatter.format(selectedTransaction.total_amount)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedTransaction
                  ? t("history.edit.title", { values: { id: selectedTransaction.id } })
                  : t("history.actions.edit")}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-3">
                {editItems.map((item) => (
                  <Card key={item.productId} className="p-4">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {t("history.edit.available")}: {formatQuantityWithUnit(item.availableStock, item.unit, t)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("customers.export.columns.unitPrice")}: {currencyFormatter.format(item.unitPrice)}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeEditableItem(item.productId)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateEditableItemQuantity(item.productId, item.quantity - getQuantityStep(item.unit))}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(event) => updateEditableItemQuantity(item.productId, Number(event.target.value) || 0)}
                        min={item.unit === "metr" ? "0.01" : "1"}
                        step={getQuantityInputStep(item.unit)}
                        className="w-28 text-center"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateEditableItemQuantity(item.productId, item.quantity + getQuantityStep(item.unit))}
                      >
                        +
                      </Button>
                      <Badge variant="outline">{getUnitLabel(item.unit, t, "short")}</Badge>
                      <div className="ml-auto font-semibold">
                        {currencyFormatter.format(item.quantity * item.unitPrice)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="space-y-3">
                <Label>{t("history.edit.addProduct")}</Label>
                <Input
                  placeholder={t("history.edit.searchProducts")}
                  value={editProductSearchQuery}
                  onChange={(event) => setEditProductSearchQuery(event.target.value)}
                />
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {filteredEditProducts.slice(0, 12).map((product) => (
                    <Card
                      key={product.id}
                      className="p-3 cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => addEditableProduct(product)}
                    >
                      <div className="flex justify-between items-center gap-3">
                        <div>
                          <div className="font-medium">{product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {t("history.edit.available")}: {formatQuantityWithUnit(product.quantity, product.unit, t)} • {currencyFormatter.format(product.sell_price)}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-primary" />
                      </div>
                    </Card>
                  ))}
                  {filteredEditProducts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t("history.edit.noProducts")}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleSaveTransactionEdit}>{t("history.edit.save")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {noResults && (
          <Card className="p-6 text-center text-muted-foreground">
            {t("history.noMatches")}
          </Card>
        )}

        {noTransactions && (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t("history.empty")}</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
