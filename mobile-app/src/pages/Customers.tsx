import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDatabase, saveDatabase } from "@/lib/db";
import { Customer } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Pencil, Download, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { downloadExcelFile } from "@/lib/excel";
import { useTranslation } from "@/hooks/useTranslation";

interface CustomerTransactionItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface CustomerTransaction {
  id: number;
  date: string;
  total_amount: number;
  payment_status: "fully_paid" | "debt";
  items: CustomerTransactionItem[];
}

interface CustomerStats {
  count: number;
  total: number;
  paid: number;
  debt: number;
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null);
  const [transactionsByCustomer, setTransactionsByCustomer] = useState<Record<number, CustomerTransaction[]>>({});
  const { t } = useTranslation();

  const currencyFormatter = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD"
  }), []);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = () => {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM customers ORDER BY name');
    if (result[0]) {
      const custs = result[0].values.map((row) => ({
        id: row[0] as number,
        name: row[1] as string,
        phone: row[2] as string,
        notes: row[3] as string,
        created_at: row[4] as string,
      }));
      setCustomers(custs);
    }
  };

  const handleSaveCustomer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const db = getDatabase();

    try {
      if (editingCustomer) {
        db.run(
          'UPDATE customers SET name=?, phone=?, notes=? WHERE id=?',
          [
            formData.get('name'),
            formData.get('phone'),
            formData.get('notes'),
            editingCustomer.id
          ]
        );
        toast.success(t("customers.toast.updated"));
      } else {
        db.run(
          'INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)',
          [
            formData.get('name'),
            formData.get('phone'),
            formData.get('notes')
          ]
        );
        toast.success(t("customers.toast.added"));
      }

      saveDatabase();
      loadCustomers();
      setIsDialogOpen(false);
      setEditingCustomer(null);
    } catch (error) {
      toast.error(t("customers.toast.saveError"));
      console.error(error);
    }
  };

  const getCustomerTransactions = (customerId: number): CustomerStats => {
    const db = getDatabase();
    const result = db.exec(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(total_amount), 0) as total,
         COALESCE(SUM(CASE WHEN payment_status = 'fully_paid' THEN total_amount ELSE 0 END), 0) as paid,
         COALESCE(SUM(CASE WHEN payment_status = 'debt' THEN total_amount ELSE 0 END), 0) as debt
       FROM transactions
       WHERE customer_id = ?`,
      [customerId]
    );

    if (result[0]) {
      return {
        count: result[0].values[0][0] as number,
        total: result[0].values[0][1] as number,
        paid: result[0].values[0][2] as number,
        debt: result[0].values[0][3] as number
      };
    }
    return { count: 0, total: 0, paid: 0, debt: 0 };
  };

  const loadCustomerTransactions = (customerId: number) => {
    const db = getDatabase();
    const result = db.exec(
      `SELECT id, date, total_amount, payment_status
       FROM transactions
       WHERE customer_id = ?
       ORDER BY date DESC`,
      [customerId]
    );

    const transactions: CustomerTransaction[] = result[0]
      ? result[0].values.map(row => {
          const transactionId = row[0] as number;
          const itemsResult = db.exec(
            `SELECT p.name as product_name, ti.quantity, ti.unit_price, ti.line_total
             FROM transaction_items ti
             JOIN products p ON ti.product_id = p.id
             WHERE ti.transaction_id = ?`,
            [transactionId]
          );

          const items: CustomerTransactionItem[] = itemsResult[0]
            ? itemsResult[0].values.map(itemRow => ({
                product_name: itemRow[0] as string,
                quantity: itemRow[1] as number,
                unit_price: itemRow[2] as number,
                line_total: itemRow[3] as number
              }))
            : [];

          return {
            id: transactionId,
            date: row[1] as string,
            total_amount: row[2] as number,
            payment_status: (row[3] as string) === "debt" ? "debt" : "fully_paid",
            items
          };
        })
      : [];

    setTransactionsByCustomer(prev => ({
      ...prev,
      [customerId]: transactions
    }));

    return transactions;
  };

  const handleDeleteCustomer = (customer: Customer) => {
    const confirmed = window.confirm(
      t("customers.confirm.delete", { values: { name: customer.name } })
    );
    if (!confirmed) {
      return;
    }

    const db = getDatabase();
    db.run(
      "DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE customer_id = ?)",
      [customer.id]
    );
    db.run("DELETE FROM transactions WHERE customer_id = ?", [customer.id]);
    db.run("UPDATE shopping_lists SET customer_id = NULL WHERE customer_id = ?", [customer.id]);
    db.run("DELETE FROM customers WHERE id = ?", [customer.id]);
    saveDatabase();
    toast.success(t("customers.toast.deleted"));
    setExpandedCustomerId(prev => (prev === customer.id ? null : prev));
    setTransactionsByCustomer(prev => {
      const next = { ...prev };
      delete next[customer.id];
      return next;
    });
    loadCustomers();
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
    db.run("DELETE FROM transaction_items");
    db.run("DELETE FROM transactions");
    db.run("UPDATE shopping_lists SET customer_id = NULL");
    db.run("DELETE FROM customers");
    saveDatabase();
    setExpandedCustomerId(null);
    setTransactionsByCustomer({});
    toast.success(t("customers.toast.allDeleted"));
    loadCustomers();
  };

  const handleTogglePaymentStatus = (customerId: number, transactionId: number) => {
    const db = getDatabase();
    const current = transactionsByCustomer[customerId]?.find(tx => tx.id === transactionId);
    if (!current) return;

    const nextStatus = current.payment_status === "fully_paid" ? "debt" : "fully_paid";

    try {
      db.run(
        "UPDATE transactions SET payment_status = ? WHERE id = ?",
        [nextStatus, transactionId]
      );
      saveDatabase();
      toast.success(t("customers.toast.statusUpdated"));
      loadCustomers();
      loadCustomerTransactions(customerId);
    } catch (error) {
      console.error(error);
      toast.error(t("customers.toast.statusError"));
    }
  };

  const exportCustomerToExcel = (customer: Customer, stats: CustomerStats) => {
    const transactions = transactionsByCustomer[customer.id] ?? loadCustomerTransactions(customer.id);

    const summaryRows = [
      [
        t("customers.export.columns.customerName"),
        t("customers.export.columns.phone"),
        t("customers.export.columns.totalTransactions"),
        t("customers.export.columns.totalSpent"),
        t("customers.export.columns.fullyPaid"),
        t("customers.export.columns.outstandingDebt")
      ],
      [customer.name, customer.phone || "-", stats.count, stats.total, stats.paid, stats.debt]
    ];

    const transactionRows = [
      [
        t("customers.export.columns.transactionId"),
        t("customers.export.columns.date"),
        t("customers.export.columns.status"),
        t("customers.export.columns.transactionTotal"),
        t("customers.export.columns.item"),
        t("customers.export.columns.quantity"),
        t("customers.export.columns.unitPrice"),
        t("customers.export.columns.lineTotal")
      ],
      ...transactions.flatMap(transaction => {
        if (transaction.items.length === 0) {
          return [[
            transaction.id,
            new Date(transaction.date).toLocaleString(),
            transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
            transaction.total_amount,
            "-",
            "-",
            "-",
            "-"
          ]];
        }

          return transaction.items.map(item => [
            transaction.id,
            new Date(transaction.date).toLocaleString(),
            transaction.payment_status === "debt" ? t("customers.status.debt") : t("customers.status.paid"),
            transaction.total_amount,
            item.product_name,
            item.quantity,
            item.unit_price,
            item.line_total
          ]);
      })
    ];

    downloadExcelFile(`${customer.name.replace(/[^a-z0-9]/gi, "_")}_${t("customers.export.reportSuffix")}.xls`, [
      { name: t("customers.export.summarySheet"), rows: summaryRows },
      { name: t("customers.export.transactionsSheet"), rows: transactionRows }
    ]);
  };

  const exportAllCustomers = () => {
    if (customers.length === 0) {
      toast.error(t("customers.toast.noExport"));
      return;
    }
    const db = getDatabase();
    const result = db.exec(`
      SELECT c.id, c.name, c.phone, c.notes,
        COUNT(t.id) as transaction_count,
        COALESCE(SUM(t.total_amount), 0) as total_spent,
        COALESCE(SUM(CASE WHEN t.payment_status = 'fully_paid' THEN t.total_amount ELSE 0 END), 0) as fully_paid,
        COALESCE(SUM(CASE WHEN t.payment_status = 'debt' THEN t.total_amount ELSE 0 END), 0) as debt
      FROM customers c
      LEFT JOIN transactions t ON t.customer_id = c.id
      GROUP BY c.id, c.name, c.phone, c.notes
      ORDER BY c.name
    `);

    const rows: Array<Array<string | number>> = [[
      t("customers.export.columns.customerId"),
      t("customers.export.columns.customerName"),
      t("customers.export.columns.phone"),
      t("customers.export.columns.notes"),
      t("customers.export.columns.totalTransactions"),
      t("customers.export.columns.totalSpent"),
      t("customers.export.columns.fullyPaid"),
      t("customers.export.columns.outstandingDebt")
    ]];

    if (result[0]) {
      result[0].values.forEach(row => {
        rows.push([
          row[0] as number,
          row[1] as string,
          (row[2] as string) || "-",
          (row[3] as string) || "-",
          row[4] as number,
          row[5] as number,
          row[6] as number,
          row[7] as number
        ]);
      });
    }

    downloadExcelFile(`${t("customers.export.overviewFilename")}.xls`, [
      { name: t("customers.export.overviewSheet"), rows }
    ]);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusLabel = (status: CustomerTransaction["payment_status"]) =>
    status === "debt" ? t("customers.status.debt") : t("customers.status.paid");

  return (
    <Layout title={t("customers.title")}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-2 flex-1">
            <Input
              placeholder={t("customers.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                  <Button type="submit" className="w-full">{t("customers.form.save")}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={exportAllCustomers} className="flex-1 sm:flex-none">
              <Download className="h-4 w-4 mr-2" />
              {t("customers.export.all")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllCustomers}
              className="flex-1 sm:flex-none"
              disabled={customers.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("customers.actions.deleteAll")}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {filteredCustomers.map(customer => {
            const stats = getCustomerTransactions(customer.id);
            return (
              <Card key={customer.id} className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-4">
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
                    <div className="flex flex-col gap-2 items-end">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!transactionsByCustomer[customer.id]) {
                              loadCustomerTransactions(customer.id);
                            }
                            exportCustomerToExcel(customer, stats);
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
                        className="text-muted-foreground"
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
                      <div className="text-xl font-bold text-foreground">{stats.count}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t("customers.totalSpent")}</div>
                      <div className="text-xl font-bold text-primary">{currencyFormatter.format(stats.total)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t("customers.totalPaid")}</div>
                      <div className="text-lg font-semibold text-emerald-600">{currencyFormatter.format(stats.paid)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t("customers.totalDebt")}</div>
                      <div className="text-lg font-semibold text-destructive">{currencyFormatter.format(stats.debt)}</div>
                    </div>
                  </div>

                  {expandedCustomerId === customer.id && (
                    <div className="space-y-3 pt-4 border-t border-border">
                      <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                        {t("customers.transactions")}
                      </h4>
                      <div className="space-y-2">
                        {(transactionsByCustomer[customer.id] ?? []).map(transaction => (
                          <div
                            key={transaction.id}
                            className="border border-border rounded-lg p-3 space-y-2 bg-muted/40"
                          >
                            <div className="flex justify-between items-center">
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
                                    values: { status: statusLabel(transaction.payment_status === "debt" ? "fully_paid" : "debt") }
                                  })}
                                </Button>
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="text-sm text-muted-foreground">
                                {t("customers.transactions.itemsCount", { values: { count: transaction.items.length } })}
                              </div>
                              <div className="text-lg font-bold text-primary">
                                {currencyFormatter.format(transaction.total_amount)}
                              </div>
                            </div>
                            <div className="space-y-1">
                              {transaction.items.map((item, idx) => (
                                <div key={`${transaction.id}-${idx}`} className="flex justify-between text-sm">
                                  <div className="text-muted-foreground">
                                    {t("customers.transactions.itemSummary", {
                                      values: {
                                        name: item.product_name,
                                        quantity: item.quantity,
                                        price: currencyFormatter.format(item.unit_price)
                                      }
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
            );
          })}
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery ? t("customers.noMatches") : t("customers.empty")}
          </div>
        )}
      </div>
    </Layout>
  );
}
