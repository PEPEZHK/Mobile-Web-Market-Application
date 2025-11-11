import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getDatabase } from "@/lib/db";
import { format } from "date-fns";
import { Receipt } from "lucide-react";

interface TransactionWithDetails {
  id: number;
  date: string;
  customer_name: string | null;
  total_amount: number;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

export default function History() {
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);

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
        c.name as customer_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      ORDER BY t.date DESC
    `);

    if (result[0]) {
      const txs = result[0].values.map((row) => {
        const transactionId = row[0] as number;
        
        // Get items for this transaction
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
          customer_name: row[3] as string | null,
          items
        };
      });
      
      setTransactions(txs);
    }
  };

  return (
    <Layout title="Transaction History">
      <div className="space-y-3">
        {transactions.map(transaction => (
          <Dialog key={transaction.id}>
            <DialogTrigger asChild>
              <Card className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground">
                        Transaction #{transaction.id}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(transaction.date), 'MMM dd, yyyy • HH:mm')}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-primary">
                      ${transaction.total_amount.toFixed(2)}
                    </div>
                  </div>
                </div>
                
                {transaction.customer_name && (
                  <Badge variant="secondary" className="mt-2">
                    {transaction.customer_name}
                  </Badge>
                )}
                
                <div className="text-sm text-muted-foreground mt-2">
                  {transaction.items.length} item(s)
                </div>
              </Card>
            </DialogTrigger>
            
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transaction #{transaction.id}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {format(new Date(transaction.date), 'MMMM dd, yyyy • HH:mm')}
                </div>
                
                {transaction.customer_name && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Customer</div>
                    <div className="font-medium">{transaction.customer_name}</div>
                  </div>
                )}
                
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Items</div>
                  <div className="space-y-2">
                    {transaction.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start p-3 bg-muted rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{item.product_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {item.quantity} × ${item.unit_price.toFixed(2)}
                          </div>
                        </div>
                        <div className="font-semibold">
                          ${item.line_total.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold">Total</span>
                    <span className="text-2xl font-bold text-primary">
                      ${transaction.total_amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ))}

        {transactions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No transactions yet</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
