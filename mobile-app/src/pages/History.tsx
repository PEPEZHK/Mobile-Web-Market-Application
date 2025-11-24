import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getDatabase } from "@/lib/db";
import { endOfDay, endOfMonth, endOfWeek, endOfYear, format, parseISO, startOfDay, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { Receipt, Search, Download } from "lucide-react";
import { downloadExcelFile } from "@/lib/excel";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/hooks/useTranslation";

interface TransactionWithDetails {
  id: number;
  date: string;
  customer_name: string | null;
  total_amount: number;
  payment_status: 'fully_paid' | 'debt';
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

export default function History() {
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [summaryPeriod, setSummaryPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [selectedDay, setSelectedDay] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    const weekNumber = format(now, "II");
    return `${format(now, 'yyyy')}-W${weekNumber}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [selectedYear, setSelectedYear] = useState(() => format(new Date(), 'yyyy'));
  const { t } = useTranslation();
  const currencyFormatter = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD"
  }), []);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = () => {
    const db = getDatabase();
    
    const result = db.exec(`
      SELECT
        t.id,
        t.date,
        t.total_amount,
        t.payment_status,
        c.name as customer_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      ORDER BY t.date DESC
    `);

    if (result[0]) {
      const txs = result[0].values.map((row) => {
        const transactionId = row[0] as number;
        
        const itemsResult = db.exec(`
          SELECT 
            p.name as product_name,
            ti.quantity,
            ti.unit_price,
            ti.line_total
          FROM transaction_items ti
          JOIN products p ON ti.product_id = p.id
          WHERE ti.transaction_id = ?
        `, [transactionId]);

        const items = itemsResult[0] ? itemsResult[0].values.map(itemRow => ({
          product_name: itemRow[0] as string,
          quantity: itemRow[1] as number,
          unit_price: itemRow[2] as number,
          line_total: itemRow[3] as number,
        })) : [];

        return {
          id: transactionId,
          date: row[1] as string,
          total_amount: row[2] as number,
          payment_status: (row[3] as string) === 'debt' ? 'debt' : 'fully_paid',
          customer_name: row[4] as string | null,
          items
        };
      });
      
      setTransactions(txs);
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery === "") {
      return true;
    }

    const transactionLabel = `transaction #${transaction.id}`.toLowerCase();
    const alternateLabel = `transaction ${transaction.id}`.toLowerCase();
    const customerName = transaction.customer_name?.toLowerCase() ?? "";
    const transactionItems = transaction.items.map(item => item.product_name.toLowerCase());

    return (
      transactionLabel.includes(normalizedQuery) ||
      transaction.id.toString().includes(normalizedQuery) ||
      alternateLabel.includes(normalizedQuery) ||
      customerName.includes(normalizedQuery) ||
      transactionItems.some(itemName => itemName.includes(normalizedQuery))
    );
  });

  const noTransactions = transactions.length === 0;
  const noResults = !noTransactions && filteredTransactions.length === 0;

  const exportHistoryToExcel = () => {
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
      t("customers.export.columns.unitPrice"),
      t("customers.export.columns.lineTotal"),
      t("customers.export.columns.transactionTotal")
    ]];

    filteredTransactions.forEach(transaction => {
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
          transaction.total_amount
        ]);
        return;
      }

      transaction.items.forEach(item => {
        rows.push([
          transaction.id,
          format(new Date(transaction.date), "yyyy-MM-dd HH:mm"),
          transaction.customer_name ?? "-",
          transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
          item.product_name,
          item.quantity,
          item.unit_price,
          item.line_total,
          transaction.total_amount
        ]);
      });
    });

    downloadExcelFile(`${t("history.export.filename")}.xls`, [
      { name: t("history.export.transactionsSheet"), rows }
    ]);
  };

  const computeRange = () => {
    if (summaryPeriod === 'day') {
      const day = parseISO(selectedDay);
      if (Number.isNaN(day.getTime())) {
        return null;
      }
      return {
        start: startOfDay(day),
        end: endOfDay(day),
        filename: `${selectedDay}-summary.xls`,
        label: format(day, 'PPP')
      };
    }

    if (summaryPeriod === 'week') {
      const [yearPart, weekPart] = selectedWeek.split('-W');
      const weekNumber = parseInt(weekPart ?? '1', 10) || 1;
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
      const filename = `${format(start, 'yyyy-MM-dd')}_to_${format(end, 'yyyy-MM-dd')}-summary.xls`;
      const label = `${format(start, 'PPP')} - ${format(end, 'PPP')}`;
      return { start, end, filename, label };
    }

    if (summaryPeriod === 'month') {
      const monthDate = parseISO(`${selectedMonth}-01`);
      if (Number.isNaN(monthDate.getTime())) {
        return null;
      }
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      return {
        start,
        end,
        filename: `${format(start, 'yyyy-MM')}-summary.xls`,
        label: format(start, 'LLLL yyyy')
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
      filename: `${format(start, 'yyyy')}-summary.xls`,
      label: format(start, 'yyyy')
    };
  };

  const exportSummary = () => {
    const computed = computeRange();
    if (!computed) {
      toast.error(t("history.toast.invalidPeriod"));
      return;
    }

    const { start, end, filename, label } = computed;

    const summaryTransactions = transactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= start && transactionDate <= end;
    });

    if (summaryTransactions.length === 0) {
      toast.error(t("history.toast.noPeriodTransactions"));
      return;
    }

    const totalAmount = summaryTransactions.reduce((sum, transaction) => sum + transaction.total_amount, 0);
    const paidAmount = summaryTransactions
      .filter(transaction => transaction.payment_status === 'fully_paid')
      .reduce((sum, transaction) => sum + transaction.total_amount, 0);
    const debtAmount = summaryTransactions
      .filter(transaction => transaction.payment_status === 'debt')
      .reduce((sum, transaction) => sum + transaction.total_amount, 0);

    const overviewRows: Array<Array<string | number>> = [
      [t("history.summary.period"), label],
      [t("history.summary.start"), format(start, 'yyyy-MM-dd HH:mm')],
      [t("history.summary.end"), format(end, 'yyyy-MM-dd HH:mm')],
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
        t("history.summary.table.items")
      ],
      ...summaryTransactions.map(transaction => {
        const transactionDate = format(new Date(transaction.date), 'yyyy-MM-dd HH:mm');
        const saleType = transaction.payment_status === 'debt'
          ? t("customers.status.debt")
          : t("customers.status.paid");
        const itemsDescription = transaction.items.length > 0
          ? transaction.items.map(item => `${item.product_name} (${item.quantity}× ${currencyFormatter.format(item.line_total)})`).join('; ')
          : t("history.detail.noItems");

        return [
          transactionDate,
          transaction.customer_name ?? '-',
          saleType,
          Number(transaction.total_amount.toFixed(2)),
          itemsDescription
        ];
      })
    ];

    const detailRows: Array<Array<string | number>> = [[
      t("customers.export.columns.transactionId"),
      t("customers.export.columns.date"),
      t("customers.export.columns.customer"),
      t("customers.export.columns.status"),
      t("customers.export.columns.item"),
      t("customers.export.columns.quantity"),
      t("customers.export.columns.unitPrice"),
      t("customers.export.columns.lineTotal"),
      t("customers.export.columns.transactionTotal")
    ]];

    summaryTransactions.forEach(transaction => {
      const transactionDate = format(new Date(transaction.date), 'yyyy-MM-dd HH:mm');
      if (transaction.items.length === 0) {
        detailRows.push([
          transaction.id,
          transactionDate,
          transaction.customer_name ?? '-',
          transaction.payment_status === 'debt' ? t("customers.status.debt") : t("customers.status.paid"),
          '-',
          '-',
          '-',
          '-',
          transaction.total_amount
        ]);
        return;
      }

      transaction.items.forEach(item => {
        detailRows.push([
          transaction.id,
          transactionDate,
          transaction.customer_name ?? '-',
          transaction.payment_status === 'debt' ? t("customers.status.debt") : t("customers.status.paid"),
          item.product_name,
          item.quantity,
          item.unit_price,
          item.line_total,
          transaction.total_amount
        ]);
      });
    });

    downloadExcelFile(filename, [
      { name: t("history.export.summarySheet"), rows: overviewRows },
      { name: t("history.export.transactionsSheet"), rows: detailRows }
    ]);

    setIsSummaryDialogOpen(false);
    toast.success(t("history.toast.summaryExported"));
  };

  return (
    <Layout title={t("history.title")}>
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative sm:max-w-xs flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("history.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex w-full sm:w-auto gap-2">
            <Button variant="outline" onClick={exportHistoryToExcel} className="flex-1 sm:flex-none">
              <Download className="h-4 w-4 mr-2" />
              {t("history.export.all")}
            </Button>
            <Button onClick={() => setIsSummaryDialogOpen(true)} className="flex-1 sm:flex-none">
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
                {summaryPeriod === 'day' && (
                  <Input
                    type="date"
                    value={selectedDay}
                    onChange={(event) => setSelectedDay(event.target.value)}
                    aria-label={t("history.summary.dayLabel")}
                  />
                )}
                {summaryPeriod === 'week' && (
                  <Input
                    type="week"
                    value={selectedWeek}
                    onChange={(event) => setSelectedWeek(event.target.value)}
                    aria-label={t("history.summary.weekLabel")}
                  />
                )}
                {summaryPeriod === 'month' && (
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    aria-label={t("history.summary.monthLabel")}
                  />
                )}
                {summaryPeriod === 'year' && (
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

        {filteredTransactions.map(transaction => (
          <Dialog key={transaction.id}>
            <DialogTrigger asChild>
              <Card className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground">
                        {t("history.transactionNumber", { values: { id: transaction.id } })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(transaction.date), 'MMM dd, yyyy • HH:mm')}
                    </p>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="text-xl font-bold text-primary">
                      {currencyFormatter.format(transaction.total_amount)}
                    </div>
                    <Badge variant={transaction.payment_status === 'debt' ? 'destructive' : 'secondary'}>
                      {transaction.payment_status === 'debt' ? t("customers.status.debt") : t("customers.status.paid")}
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
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("history.transactionNumber", { values: { id: transaction.id } })}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {format(new Date(transaction.date), 'MMMM dd, yyyy • HH:mm')}
                </div>

                <Badge variant={transaction.payment_status === 'debt' ? 'destructive' : 'secondary'}>
                  {transaction.payment_status === 'debt' ? t("customers.status.debt") : t("customers.status.paid")}
                </Badge>

                {transaction.customer_name && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">{t("history.detail.customer")}</div>
                    <div className="font-medium">{transaction.customer_name}</div>
                  </div>
                )}

                <div>
                  <div className="text-sm text-muted-foreground mb-2">{t("history.detail.itemsTitle")}</div>
                  {transaction.items.length > 0 ? (
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
                        {transaction.items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{currencyFormatter.format(item.unit_price)}</TableCell>
                            <TableCell className="text-right font-semibold">{currencyFormatter.format(item.line_total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={3} className="text-right font-medium">{t("history.detail.itemsSubtotal")}</TableCell>
                          <TableCell className="text-right font-semibold">{currencyFormatter.format(transaction.items.reduce((sum, item) => sum + item.line_total, 0))}</TableCell>
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
                      {currencyFormatter.format(transaction.total_amount)}
                    </span>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ))}

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
