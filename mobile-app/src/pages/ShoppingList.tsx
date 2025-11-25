import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDatabase, saveDatabase } from "@/lib/db";
import { ensureMonthlyRestockList, MONTHLY_RESTOCK_TYPE, syncListItemsToDepot, transferMonthlyRestock, UNASSIGNED_CUSTOMER_VALUE } from "@/lib/shopping";
import { Customer, ShoppingList, ShoppingListWithStats } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import {
  ArrowRight,
  CheckCircle2,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

const defaultListForm: ListFormState = {
  title: "",
  type: "restock",
  status: "active",
  priority: "medium",
  customerId: "",
  dueDate: "",
  notes: ""
};

type ListFilter = "all" | "restock" | "customer_order" | "completed";

interface ListFormState {
  title: string;
  type: ShoppingList["type"];
  status: ShoppingList["status"];
  priority: ShoppingList["priority"];
  customerId: string;
  dueDate: string;
  notes: string;
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

function priorityVariant(priority: ShoppingList["priority"]): "outline" | "default" | "destructive" {
  if (priority === "high") return "destructive";
  if (priority === "medium") return "default";
  return "outline";
}

export default function ShoppingListPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<ShoppingListWithStats[]>([]);
  const [monthlyRestock, setMonthlyRestock] = useState<ShoppingListWithStats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isListDialogOpen, setIsListDialogOpen] = useState(false);
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [listForm, setListForm] = useState<ListFormState>(defaultListForm);
  const { t } = useTranslation();

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
    loadLists();
    loadCustomers();
  }, []);

  const overallStats = useMemo(() => {
    const activeLists = lists.filter(list => list.status === "active").length;
    const pendingCount = lists.reduce((acc, list) => acc + list.pending_count, 0);
    const outstanding = lists.reduce((acc, list) => acc + (list.pending_estimated_total ?? 0), 0);
    return { activeLists, pendingCount, outstanding };
  }, [lists]);

  const filteredLists = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();
    return lists.filter(list => {
      const isMonthlyRestock = list.type === MONTHLY_RESTOCK_TYPE;
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "completed"
            ? list.status === "completed"
            : filter === "restock"
              ? list.type === "restock" || isMonthlyRestock
              : list.type === "customer_order";
      const matchesSearch = lowerSearch
        ? list.title.toLowerCase().includes(lowerSearch) || (list.customer_name?.toLowerCase().includes(lowerSearch) ?? false)
        : true;
      return matchesFilter && matchesSearch;
    });
  }, [filter, lists, searchTerm]);

  const handleListDialogOpenChange = (open: boolean) => {
    setIsListDialogOpen(open);
    if (!open) {
      setListForm(defaultListForm);
      setEditingListId(null);
    }
  };

  const loadLists = () => {
    const db = getDatabase();
    const monthlyListId = ensureMonthlyRestockList(db);
    saveDatabase();
    const listResult = db.exec(`
      SELECT l.id, l.title, l.type, l.status, l.priority, l.notes, l.customer_id, c.name, l.due_date, l.created_at
      FROM shopping_lists l
      LEFT JOIN customers c ON c.id = l.customer_id
      ORDER BY datetime(l.created_at) DESC
    `);

    const aggregateResult = db.exec(`
      SELECT li.list_id,
        SUM(CASE WHEN li.is_completed = 0 THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN li.is_completed = 1 THEN 1 ELSE 0 END) as completed_count,
        SUM(li.quantity_value * COALESCE(NULLIF(li.estimated_unit_cost, 0), p.buy_price, 0)) as estimated_total,
        SUM(CASE WHEN li.is_completed = 0 THEN li.quantity_value * COALESCE(NULLIF(li.estimated_unit_cost, 0), p.buy_price, 0) ELSE 0 END) as pending_estimated_total
      FROM shopping_list_items li
      LEFT JOIN products p ON p.id = li.product_id
      GROUP BY li.list_id
    `);

    const aggregates = new Map<number, { pending: number; completed: number; estimated: number; pendingEstimated: number }>();
    if (aggregateResult[0]) {
      aggregateResult[0].values.forEach(row => {
        aggregates.set(row[0] as number, {
          pending: Number(row[1] ?? 0),
          completed: Number(row[2] ?? 0),
          estimated: Number(row[3] ?? 0),
          pendingEstimated: Number(row[4] ?? 0)
        });
      });
    }

    const loadedLists: ShoppingListWithStats[] = listResult[0]
      ? listResult[0].values.map(row => {
          const aggregate = aggregates.get(row[0] as number);
          return {
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
            pending_count: aggregate?.pending ?? 0,
            completed_count: aggregate?.completed ?? 0,
            estimated_total: aggregate?.estimated ?? 0,
            pending_estimated_total: aggregate?.pendingEstimated ?? 0
          };
        })
      : [];

    const monthlyList = loadedLists.find(list => list.type === MONTHLY_RESTOCK_TYPE) ?? null;

    setMonthlyRestock(monthlyList);
    setLists(loadedLists);
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

  const handleSubmitList = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!listForm.title.trim()) {
      toast.error(t("shopping.form.validation.title"));
      return;
    }

    const db = getDatabase();
    const customerId = listForm.customerId ? Number(listForm.customerId) : null;
    const dueDateValue = listForm.dueDate.trim() || null;

    try {
      if (editingListId) {
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
            editingListId
          ]
        );
        toast.success(t("shopping.toast.listUpdated"));
      } else {
        db.run(
          `INSERT INTO shopping_lists (title, type, status, priority, notes, customer_id, due_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            listForm.title.trim(),
            listForm.type,
            listForm.status,
            listForm.priority,
            listForm.notes.trim() || null,
            customerId,
            dueDateValue
          ]
        );
        toast.success(t("shopping.toast.listCreated"));
      }

      saveDatabase();
      handleListDialogOpenChange(false);
      loadLists();
    } catch (error) {
      console.error(error);
      toast.error(t("shopping.toast.listSaveError"));
    }
  };

  const handleEditList = (list: ShoppingListWithStats) => {
    setEditingListId(list.id);
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

  const handleDeleteList = (list: ShoppingListWithStats) => {
    const confirmed = window.confirm(
      t("shopping.confirm.deleteList", { values: { title: list.title } })
    );
    if (!confirmed) return;

    const db = getDatabase();
    db.run("DELETE FROM shopping_list_items WHERE list_id = ?", [list.id]);
    db.run("DELETE FROM shopping_lists WHERE id = ?", [list.id]);
    saveDatabase();
    toast.success(t("shopping.toast.listDeleted"));
    loadLists();
  };

  const handleDeleteAllLists = () => {
    if (lists.length === 0) {
      toast.error(t("shopping.toast.noListsToDelete"));
      return;
    }

    const confirmed = window.confirm(t("shopping.confirm.deleteAll"));
    if (!confirmed) return;

    const db = getDatabase();
    db.run("DELETE FROM shopping_list_items");
    db.run("DELETE FROM shopping_lists");
    saveDatabase();
    toast.success(t("shopping.toast.allDeleted"));
    loadLists();
  };

  const handleToggleListStatus = (list: ShoppingListWithStats) => {
    const nextStatus = list.status === "completed" ? "active" : "completed";
    const db = getDatabase();
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
    loadLists();
  };

  const handleTransferMonthlyRestock = () => {
    const db = getDatabase();
    const listId = monthlyRestock?.id ?? ensureMonthlyRestockList(db);
    const transferResult = transferMonthlyRestock(db, listId);
    saveDatabase();
    toast.success(
      t("shopping.toast.itemsTransferred", {
        values: { count: transferResult.updatedProducts || transferResult.totalQuantity }
      })
    );
    loadLists();
  };

  return (
    <Layout title={t("shopping.title")}>
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">{t("shopping.stats.active")}</p>
            <div className="text-2xl font-semibold">{overallStats.activeLists}</div>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">{t("shopping.stats.pending")}</p>
            <div className="text-2xl font-semibold">{overallStats.pendingCount}</div>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">{t("shopping.stats.outstanding")}</p>
            <div className="text-2xl font-semibold">{formatCurrency(overallStats.outstanding)}</div>
          </Card>
        </div>

        {monthlyRestock && (
          <Card className="p-4 border-dashed border-primary/40">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  {t("shopping.monthly.subtitle", { defaultValue: "Monthly restock list" })}
                </p>
                <h3 className="text-lg font-semibold">{monthlyRestock.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("shopping.monthly.pending", {
                    defaultValue: "Pending items: {count}",
                    values: { count: monthlyRestock.pending_count }
                  })}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => navigate(`/shopping-list/${monthlyRestock.id}`)}>
                  {t("shopping.monthly.view", { defaultValue: "Open list" })}
                </Button>
                <Button onClick={handleTransferMonthlyRestock} disabled={monthlyRestock.pending_count === 0}>
                  {t("shopping.monthly.transfer", { defaultValue: "Transfer items" })}
                </Button>
              </div>
            </div>
          </Card>
        )}

        <Card className="h-full">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t("shopping.intro.heading")}</h2>
                <p className="text-sm text-muted-foreground">{t("shopping.intro.description")}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Dialog open={isListDialogOpen} onOpenChange={handleListDialogOpenChange}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => {
                        setListForm(defaultListForm);
                        setEditingListId(null);
                        setIsListDialogOpen(true);
                      }}
                    >
                      <ListPlus className="mr-2 h-4 w-4" />
                      {t("shopping.actions.newList")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingListId ? t("shopping.dialog.editTitle") : t("shopping.dialog.createTitle")}
                      </DialogTitle>
                      <DialogDescription>{t("shopping.dialog.description")}</DialogDescription>
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
                    <Button type="submit" className="w-full">
                      {editingListId ? t("shopping.form.submit.save") : t("shopping.form.submit.create")}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAllLists}
                  disabled={lists.length === 0}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("shopping.actions.deleteAll")}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label className="text-sm">{t("shopping.search.label")}</Label>
                <Input
                  placeholder={t("shopping.search.placeholder")}
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t("shopping.filter.label")}</Label>
                <Select value={filter} onValueChange={value => setFilter(value as ListFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("shopping.filter.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("shopping.filter.all")}</SelectItem>
                <SelectItem value="restock">{t("shopping.filter.restock")}</SelectItem>
                <SelectItem value="customer_order">{t("shopping.filter.customer")}</SelectItem>
                <SelectItem value="completed">{t("shopping.filter.completed")}</SelectItem>
              </SelectContent>
            </Select>
              </div>
            </div>

            <ScrollArea className="h-[520px] pr-2">
              <div className="space-y-3">
                {filteredLists.length === 0 && (
                  <Card className="p-4 text-sm text-muted-foreground">
                    {t("shopping.empty")}
                  </Card>
                )}
                {filteredLists.map(list => {
                  const totalItems = list.pending_count + list.completed_count;
                  const dueDateText = formatDate(list.due_date);
                  return (
                    <Card key={list.id} className="p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">{list.title}</span>
                            <Badge variant="secondary">{listTypeLabel(list.type)}</Badge>
                            <Badge variant={priorityVariant(list.priority)}>
                              {t("shopping.priority.badge", { values: { priority: priorityLabel(list.priority) } })}
                            </Badge>
                            <Badge variant="outline">{statusLabel(list.status)}</Badge>
                            {list.status === "completed" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                          </div>
                          {list.customer_name && (
                            <p className="text-sm text-muted-foreground">
                              {t("shopping.list.customerLabel", { values: { name: list.customer_name } })}
                            </p>
                          )}
                          {dueDateText && (
                            <p className="text-xs text-muted-foreground">
                              {t("shopping.list.due", { values: { date: dueDateText } })}
                            </p>
                          )}
                          {list.notes && (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{list.notes}</p>
                          )}
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>{t("shopping.list.summary.items", { values: { count: totalItems } })}</span>
                            <span>{t("shopping.list.summary.pending", { values: { count: list.pending_count } })}</span>
                            <span>{t("shopping.list.summary.budget", { values: { amount: formatCurrency(list.estimated_total) } })}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/shopping-list/${list.id}`)}
                          >
                            {t("shopping.list.viewDetails")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => handleEditList(list)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t("shopping.actions.edit")}
                              </DropdownMenuItem>
                              {list.status !== "completed" && (
                                <DropdownMenuItem onSelect={() => handleToggleListStatus(list)}>
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  {t("shopping.actions.markCompleted")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => handleDeleteList(list)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("shopping.actions.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
