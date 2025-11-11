import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDatabase, saveDatabase } from "@/lib/db";
import { Product, Customer, CartItem } from "@/types";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
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
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity >= product.quantity) {
        toast.error("Not enough stock");
        return;
      }
      setCart(cart.map(item => 
        item.product.id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    setIsProductDialogOpen(false);
    toast.success("Added to cart");
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
      toast.error("Not enough stock");
      return;
    }

    setCart(cart.map(item => 
      item.product.id === productId 
        ? { ...item, quantity }
        : item
    ));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.product.sell_price * item.quantity), 0);
  };

  const completeSale = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    const db = getDatabase();
    const total = calculateTotal();
    
    try {
      // Create transaction
      db.run(
        'INSERT INTO transactions (customer_id, total_amount) VALUES (?, ?)',
        [selectedCustomerId || null, total]
      );
      
      const result = db.exec('SELECT last_insert_rowid() as id');
      const transactionId = result[0].values[0][0] as number;

      // Add transaction items and update stock
      cart.forEach(item => {
        const lineTotal = item.product.sell_price * item.quantity;
        
        db.run(
          'INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?)',
          [transactionId, item.product.id, item.quantity, item.product.sell_price, lineTotal]
        );
        
        db.run(
          'UPDATE products SET quantity = quantity - ? WHERE id = ?',
          [item.quantity, item.product.id]
        );
      });

      saveDatabase();
      toast.success("Sale completed successfully!");
      
      setCart([]);
      setSelectedCustomerId("");
      loadData();
    } catch (error) {
      toast.error("Failed to complete sale");
      console.error(error);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout title="Sales / POS">
      <div className="space-y-4">
        <Card className="p-4">
          <Label className="text-sm text-muted-foreground mb-2 block">Customer (Optional)</Label>
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="Walk-in customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Walk-in customer</SelectItem>
              {customers.map(customer => (
                <SelectItem key={customer.id} value={customer.id.toString()}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Add Product to Cart
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Product</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4"
            />
            <div className="space-y-2">
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
                        Stock: {product.quantity} • ${product.sell_price.toFixed(2)}
                      </div>
                    </div>
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-3">
          {cart.map(item => (
            <Card key={item.product.id} className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold">{item.product.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    ${item.product.sell_price.toFixed(2)} each
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
              <div className="flex items-center gap-3">
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
                <div className="ml-auto text-right">
                  <div className="font-bold text-lg">
                    ${(item.product.sell_price * item.quantity).toFixed(2)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {cart.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Cart is empty</p>
          </div>
        )}

        {cart.length > 0 && (
          <Card className="p-6 sticky bottom-20 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xl font-bold">Total</span>
              <span className="text-3xl font-bold text-primary">
                ${calculateTotal().toFixed(2)}
              </span>
            </div>
            <Button onClick={completeSale} className="w-full" size="lg">
              Complete Sale
            </Button>
          </Card>
        )}
      </div>
    </Layout>
  );
}
