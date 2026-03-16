import { useState, useEffect, useMemo, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteAllTransactions,
  deleteTransactionsByCustomer,
  getDatabase,
  getTransactionsWithDetails,
  listCustomersWithStats,
  logPayment,
  saveDatabase,
  type CustomerWithStats,
  type TransactionWithDetails,
} from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Pencil, Download, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { formatCurrency } from "@/lib/utils";
import { exportSheetsAsExcel } from "@/lib/export-excel";
import { formatQuantityWithUnit, getUnitLabel } from "@/lib/units";
import { syncMonthlyRestockFromDepot } from "@/lib/shopping";

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithStats | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null);
  const [transactionsByCustomer, setTransactionsByCustomer] = useState<Record<number, TransactionWithDetails[]>>({});
  const { t } = useTranslation();

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
      }),
    [],
  );

  const loadCustomers = useCallback((query = "") => {
    setCustomers(listCustomersWithStats(query));
  }, []);

  useEffect(() => {
    loadCustomers(searchQuery);
  }, [loadCustomers, searchQuery]);

  const handleSaveCustomer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const db = getDatabase();

    try {
      if (editingCustomer) {
        db.run(
          "UPDATE customers SET name=?, phone=?, notes=? WHERE id=?",
          [
            formData.get("name"),
            formData.get("phone"),
            formData.get("notes"),
            editingCustomer.id,
          ],
        );
        toast.success(t("customers.toast.updated"));
      } else {
        db.run(
          "INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)",
          [formData.get("name"), formData.get("phone"), formData.get("notes")],
        );
        toast.success(t("customers.toast.added"));
      }

      saveDatabase();
      loadCustomers(searchQuery);
      setIsDialogOpen(false);
      setEditingCustomer(null);
    } catch (error) {
      toast.error(t("customers.toast.saveError"));
      console.error(error);
    }
  };

  const loadCustomerTransactions = (customerId: number) => {
    const transactions = getTransactionsWithDetails({ customerId });
    setTransactionsByCustomer((prev) => ({
      ...prev,
      [customerId]: transactions,
    }));
    return transactions;
  };

  const handleDeleteCustomer = (customer: CustomerWithStats) => {
    const confirmed = window.confirm(
      t("customers.confirm.delete", { values: { name: customer.name } }),
    );
    if (!confirmed) {
      return;
    }

    const db = getDatabase();

    try {
      deleteTransactionsByCustomer(customer.id);
      db.run("UPDATE shopping_lists SET customer_id = NULL WHERE customer_id = ?", [customer.id]);
      db.run("DELETE FROM customers WHERE id = ?", [customer.id]);
      syncMonthlyRestockFromDepot(db);
      saveDatabase();

      toast.success(t("customers.toast.deleted"));
      setExpandedCustomerId((prev) => (prev === customer.id ? null : prev));
      setTransactionsByCustomer((prev) => {
        const next = { ...prev };
        delete next[customer.id];
        return next;
      });
      loadCustomers(searchQuery);
    } catch (error) {
      toast.error(t("customers.toast.saveError"));
      console.error(error);
    }
  };

  const handleDeleteAllCustomers = () => {
    if (customers.length === 0) {
      toast.error(t("customers.toast.noCustomersToDelete"));
      return;
    }

    const confirmed = window.confirm(t("customers.confirm.deleteAll"));
    if (!confirmed) {
      return;
    }

    const db = getDatabase();

    try {
      deleteAllTransactions();
      db.run("UPDATE shopping_lists SET customer_id = NULL");
      db.run("DELETE FROM customers");
      syncMonthlyRestockFromDepot(db);
      saveDatabase();
      setExpandedCustomerId(null);
      setTransactionsByCustomer({});
      toast.success(t("customers.toast.allDeleted"));
      loadCustomers(searchQuery);
    } catch (error) {
      toast.error(t("customers.toast.saveError"));
      console.error(error);
    }
  };

  const handleTogglePaymentStatus = (customerId: number, transactionId: number) => {
    const db = getDatabase();
    const current = transactionsByCustomer[customerId]?.find((transaction) => transaction.id === transactionId);
    if (!current) {
      return;
    }

    const nextStatus = current.payment_status === "fully_paid" ? "debt" : "fully_paid";
    const nextPaidAmount = nextStatus === "fully_paid"
      ? current.total_amount
      : current.paid_amount && current.paid_amount < current.total_amount
        ? current.paid_amount
        : 0;

    try {
      db.run(
        "UPDATE transactions SET payment_status = ?, paid_amount = ? WHERE id = ?",
        [nextStatus, nextPaidAmount, transactionId],
      );
      const delta = nextPaidAmount - (current.paid_amount ?? 0);
      if (delta !== 0) {
        logPayment(transactionId, delta, `Status toggled to ${nextStatus}`);
      }
      saveDatabase();
      toast.success(t("customers.toast.statusUpdated"));
      loadCustomers(searchQuery);
      loadCustomerTransactions(customerId);
    } catch (error) {
      console.error(error);
      toast.error(t("customers.toast.statusError"));
    }
  };

  const handleAdjustPayment = (customerId: number, transactionId: number) => {
    const db = getDatabase();
    const current = transactionsByCustomer[customerId]?.find((transaction) => transaction.id === transactionId);
    if (!current) {
      return;
    }

    const promptLabel = t("customers.transactions.adjustPrompt", {
      defaultValue: `Enter amount to pay (outstanding ${formatCurrency(current.outstanding)})`,
      values: { amount: formatCurrency(current.outstanding) },
    });
    const input = window.prompt(promptLabel, String(Math.max(current.outstanding, 0)));
    if (input === null) {
      return;
    }

    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error(t("customers.toast.invalidAmount", { defaultValue: "Please enter a valid number" }));
      return;
    }

    const clamped = Math.min(parsed, current.total_amount);
    const nextStatus = clamped >= current.total_amount ? "fully_paid" : "debt";

    try {
      db.run(
        "UPDATE transactions SET paid_amount = ?, payment_status = ? WHERE id = ?",
        [clamped, nextStatus, transactionId],
      );
      const delta = clamped - (current.paid_amount ?? 0);
      if (delta !== 0) {
        logPayment(transactionId, delta, "Manual payment update");
      }
      saveDatabase();
      toast.success(t("customers.toast.amountUpdated", { defaultValue: "Payment updated" }));
      loadCustomers(searchQuery);
      loadCustomerTransactions(customerId);
    } catch (error) {
      console.error(error);
      toast.error(t("customers.toast.statusError"));
    }
  };

  const exportCustomerToExcel = (customer: CustomerWithStats) => {
    const transactions = transactionsByCustomer[customer.id] ?? loadCustomerTransactions(customer.id);

    const summaryRows = [
      [
        t("customers.export.columns.customerName"),
        t("customers.export.columns.phone"),
        t("customers.export.columns.totalTransactions"),
        t("customers.export.columns.totalSpent"),
        t("customers.export.columns.fullyPaid"),
        t("customers.export.columns.outstandingDebt"),
      ],
      [customer.name, customer.phone || "-", customer.transaction_count, customer.total_spent, customer.fully_paid, customer.outstanding_debt],
    ];

    const transactionRows = [
      [
        t("customers.export.columns.transactionId"),
        t("customers.export.columns.date"),
        t("customers.export.columns.status"),
        t("customers.export.columns.transactionTotal"),
        t("customers.export.columns.item"),
        t("customers.export.columns.quantity"),
        t("common.unit"),
        t("customers.export.columns.unitPrice"),
        t("customers.export.columns.lineTotal"),
      ],
      ...transactions.flatMap((transaction) => {
        if (transaction.items.length === 0) {
          return [[
            transaction.id,
            new Date(transaction.date).toLocaleString(),
            transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
            transaction.total_amount,
            "-",
            "-",
            "-",
            "-",
            "-",
          ]];
        }

        return transaction.items.map((item) => [
          transaction.id,
          new Date(transaction.date).toLocaleString(),
          transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
          transaction.total_amount,
          item.product_name,
          item.quantity,
          getUnitLabel(item.unit, t, "short"),
          item.unit_price,
          item.line_total,
        ]);
      }),
    ];

    exportSheetsAsExcel(`${customer.name.replace(/[^a-z0-9]/gi, "_")}_${t("customers.export.reportSuffix")}.xlsx`, [
      { name: t("customers.export.summarySheet"), rows: summaryRows },
      { name: t("customers.export.transactionsSheet"), rows: transactionRows },
    ]).catch(() => toast.error(t("customers.toast.noExport")));
  };

  const exportAllCustomers = () => {
    const allCustomers = listCustomersWithStats("");
    if (allCustomers.length === 0) {
      toast.error(t("customers.toast.noExport"));
      return;
    }

    const rows: Array<Array<string | number>> = [[
      t("customers.export.columns.customerId"),
      t("customers.export.columns.customerName"),
      t("customers.export.columns.phone"),
      t("customers.export.columns.notes"),
      t("customers.export.columns.totalTransactions"),
      t("customers.export.columns.totalSpent"),
      t("customers.export.columns.fullyPaid"),
      t("customers.export.columns.outstandingDebt"),
    ]];

    allCustomers.forEach((customer) => {
      rows.push([
        customer.id,
        customer.name,
        customer.phone || "-",
        customer.notes || "-",
        customer.transaction_count,
        customer.total_spent,
        customer.fully_paid,
        customer.outstanding_debt,
      ]);
    });

    exportSheetsAsExcel(`${t("customers.export.overviewFilename")}.xlsx`, [
      { name: t("customers.export.overviewSheet"), rows },
    ]).catch(() => toast.error(t("customers.toast.noExport")));
  };

  const statusLabel = (status: TransactionWithDetails["payment_status"]) =>
    status === "debt" ? t("customers.status.debt") : t("customers.status.paid");

  return (
    <Layout title={t("customers.title")}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-2 flex-1">
            <Input
              placeholder={t("customers.search")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="flex-1"
            />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingCustomer(null)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("customers.add")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingCustomer ? t("customers.dialog.edit") : t("customers.dialog.add")}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveCustomer} className="space-y-4">
                  <div>
                    <Label htmlFor="name">{t("customers.form.name")}</Label>
                    <Input id="name" name="name" defaultValue={editingCustomer?.name} required />
                  </div>
                  <div>
                    <Label htmlFor="phone">{t("customers.form.phone")}</Label>
                    <Input id="phone" name="phone" type="tel" defaultValue={editingCustomer?.phone} />
                  </div>
                  <div>
                    <Label htmlFor="notes">{t("customers.form.notes")}</Label>
                    <Textarea id="notes" name="notes" defaultValue={editingCustomer?.notes} rows={3} />
                  </div>
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="w-full sm:w-auto">
                        {t("common.cancel")}
                      </Button>
                    </DialogClose>
                    <Button type="submit" className="w-full sm:w-auto">
                      {t("customers.form.save")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={exportAllCustomers} className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" />
              {t("customers.export.all")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllCustomers}
              className="w-full sm:w-auto"
              disabled={customers.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("customers.actions.deleteAll")}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {customers.map((customer) => (
            <Card key={customer.id} className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-foreground">{customer.name}</h3>
                    {customer.phone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </p>
                    )}
                    {customer.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{customer.notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-start sm:items-end">
                    <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!transactionsByCustomer[customer.id]) {
                            loadCustomerTransactions(customer.id);
                          }
                          exportCustomerToExcel(customer);
                        }}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        {t("customers.export.single")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingCustomer(customer);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDeleteCustomer(customer)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground w-full justify-start sm:w-auto sm:justify-end"
                      onClick={() => {
                        const nextId = expandedCustomerId === customer.id ? null : customer.id;
                        setExpandedCustomerId(nextId);
                        if (nextId) {
                          loadCustomerTransactions(nextId);
                        }
                      }}
                    >
                      {expandedCustomerId === customer.id ? (
                        <>
                          {t("customers.transactions.hide")}
                          <ChevronUp className="h-4 w-4 ml-1" />
                        </>
                      ) : (
                        <>
                          {t("customers.transactions.view")}
                          <ChevronDown className="h-4 w-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">{t("customers.totalTransactions")}</div>
                    <div className="text-xl font-bold text-foreground">{customer.transaction_count}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">{t("customers.totalSpent")}</div>
                    <div className="text-xl font-bold text-primary">{currencyFormatter.format(customer.total_spent)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">{t("customers.totalPaid")}</div>
                    <div className="text-lg font-semibold text-emerald-600">{currencyFormatter.format(customer.fully_paid)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">{t("customers.totalDebt")}</div>
                    <div className="text-lg font-semibold text-destructive">{currencyFormatter.format(customer.outstanding_debt)}</div>
                  </div>
                </div>

                {expandedCustomerId === customer.id && (
                  <div className="space-y-3 pt-4 border-t border-border">
                    <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                      {t("customers.transactions")}
                    </h4>
                    <div className="space-y-2">
                      {(transactionsByCustomer[customer.id] ?? []).map((transaction) => (
                        <div
                          key={transaction.id}
                          className="border border-border rounded-lg p-3 space-y-2 bg-muted/40"
                        >
                          <div className="flex justify-between items-center flex-wrap gap-3">
                            <div>
                              <div className="font-semibold">
                                {t("customers.transactions.transactionNumber", { values: { id: transaction.id } })}
                              </div>
                              <div className="text-xs text-muted-foreground">{new Date(transaction.date).toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={transaction.payment_status === "debt" ? "destructive" : "secondary"}>
                                {statusLabel(transaction.payment_status)}
                              </Badge>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleTogglePaymentStatus(customer.id, transaction.id)}
                              >
                                {t("customers.transactions.setStatus", {
                                  values: { status: statusLabel(transaction.payment_status === "debt" ? "fully_paid" : "debt") },
                                })}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAdjustPayment(customer.id, transaction.id)}
                              >
                                {t("customers.transactions.adjustAmount", { defaultValue: "Adjust amount" })}
                              </Button>
                            </div>
                          </div>
                          <div className="flex justify-between items-center flex-wrap gap-3">
                            <div className="space-y-1">
                              <div className="text-sm text-muted-foreground">
                                {t("customers.transactions.itemsCount", { values: { count: transaction.items.length } })}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {t("customers.transactions.outstanding", {
                                  defaultValue: "Outstanding: {amount}",
                                  values: { amount: currencyFormatter.format(transaction.outstanding) },
                                })}
                              </div>
                            </div>
                            <div className="text-lg font-bold text-primary">
                              {currencyFormatter.format(transaction.total_amount)}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {transaction.items.map((item, index) => (
                              <div key={`${transaction.id}-${index}`} className="flex justify-between text-sm gap-4">
                                <div className="text-muted-foreground">
                                  {t("customers.transactions.itemSummary", {
                                    values: {
                                      name: item.product_name,
                                      quantity: formatQuantityWithUnit(item.quantity, item.unit, t, "short"),
                                      price: currencyFormatter.format(item.unit_price),
                                    },
                                  })}
                                </div>
                                <div className="font-medium">{currencyFormatter.format(item.line_total)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {(transactionsByCustomer[customer.id] ?? []).length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-4">
                          {t("customers.noTransactions")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {customers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery ? t("customers.noMatches") : t("customers.empty")}
          </div>
        )}
      </div>
    </Layout>
  );
}
