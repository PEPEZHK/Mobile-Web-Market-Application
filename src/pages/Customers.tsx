import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDatabase, saveDatabase } from "@/lib/db";
import { Customer } from "@/types";
import { Plus, Phone, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
        toast.success("Customer updated successfully");
      } else {
        db.run(
          'INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)',
          [
            formData.get('name'),
            formData.get('phone'),
            formData.get('notes')
          ]
        );
        toast.success("Customer added successfully");
      }
      
      saveDatabase();
      loadCustomers();
      setIsDialogOpen(false);
      setEditingCustomer(null);
    } catch (error) {
      toast.error("Failed to save customer");
      console.error(error);
    }
  };

  const getCustomerTransactions = (customerId: number) => {
    const db = getDatabase();
    const result = db.exec(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total 
       FROM transactions 
       WHERE customer_id = ?`,
      [customerId]
    );
    
    if (result[0]) {
      return {
        count: result[0].values[0][0] as number,
        total: result[0].values[0][1] as number
      };
    }
    return { count: 0, total: 0 };
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout title="Customers">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingCustomer(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveCustomer} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={editingCustomer?.name} required />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" defaultValue={editingCustomer?.phone} />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" defaultValue={editingCustomer?.notes} rows={3} />
                </div>
                <Button type="submit" className="w-full">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {filteredCustomers.map(customer => {
            const stats = getCustomerTransactions(customer.id);
            return (
              <Card key={customer.id} className="p-4">
                <div className="flex justify-between items-start mb-2">
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
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                  <div>
                    <div className="text-sm text-muted-foreground">Purchases</div>
                    <div className="text-xl font-bold text-foreground">{stats.count}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Total Spent</div>
                    <div className="text-xl font-bold text-primary">${stats.total.toFixed(2)}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No customers found
          </div>
        )}
      </div>
    </Layout>
  );
}
