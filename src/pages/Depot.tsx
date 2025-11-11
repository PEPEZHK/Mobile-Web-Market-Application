import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getDatabase, saveDatabase } from "@/lib/db";
import { Product } from "@/types";
import { Plus, Search, AlertTriangle, Pencil, Minus } from "lucide-react";
import { toast } from "sonner";

export default function Depot() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, selectedCategory]);

  const loadProducts = () => {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM products ORDER BY name');
    if (result[0]) {
      const prods = result[0].values.map((row) => ({
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
  };

  const filterProducts = () => {
    let filtered = products;
    
    if (searchQuery) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (selectedCategory !== "all") {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    
    setFilteredProducts(filtered);
  };

  const categories = ["all", ...new Set(products.map(p => p.category))];

  const handleSaveProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const db = getDatabase();

    try {
      if (editingProduct) {
        db.run(
          `UPDATE products SET name=?, barcode=?, category=?, buy_price=?, sell_price=?, quantity=?, min_stock=? WHERE id=?`,
          [
            formData.get('name'),
            formData.get('barcode'),
            formData.get('category'),
            parseFloat(formData.get('buy_price') as string),
            parseFloat(formData.get('sell_price') as string),
            parseInt(formData.get('quantity') as string),
            parseInt(formData.get('min_stock') as string),
            editingProduct.id
          ]
        );
        toast.success("Product updated successfully");
      } else {
        db.run(
          `INSERT INTO products (name, barcode, category, buy_price, sell_price, quantity, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            formData.get('name'),
            formData.get('barcode'),
            formData.get('category'),
            parseFloat(formData.get('buy_price') as string),
            parseFloat(formData.get('sell_price') as string),
            parseInt(formData.get('quantity') as string),
            parseInt(formData.get('min_stock') as string)
          ]
        );
        toast.success("Product added successfully");
      }
      
      saveDatabase();
      loadProducts();
      setIsDialogOpen(false);
      setEditingProduct(null);
    } catch (error) {
      toast.error("Failed to save product");
      console.error(error);
    }
  };

  const adjustQuantity = (productId: number, change: number) => {
    const db = getDatabase();
    db.run(`UPDATE products SET quantity = quantity + ? WHERE id = ?`, [change, productId]);
    saveDatabase();
    loadProducts();
    toast.success(change > 0 ? "Stock increased" : "Stock decreased");
  };

  return (
    <Layout title="Magazin Proekt">
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingProduct(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveProduct} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={editingProduct?.name} required />
                </div>
                <div>
                  <Label htmlFor="barcode">Barcode/SKU</Label>
                  <Input id="barcode" name="barcode" defaultValue={editingProduct?.barcode} />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" name="category" defaultValue={editingProduct?.category} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="buy_price">Buy Price</Label>
                    <Input id="buy_price" name="buy_price" type="number" step="0.01" defaultValue={editingProduct?.buy_price} required />
                  </div>
                  <div>
                    <Label htmlFor="sell_price">Sell Price</Label>
                    <Input id="sell_price" name="sell_price" type="number" step="0.01" defaultValue={editingProduct?.sell_price} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" name="quantity" type="number" defaultValue={editingProduct?.quantity || 0} required />
                  </div>
                  <div>
                    <Label htmlFor="min_stock">Min Stock</Label>
                    <Input id="min_stock" name="min_stock" type="number" defaultValue={editingProduct?.min_stock || 5} required />
                  </div>
                </div>
                <Button type="submit" className="w-full">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map(cat => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="whitespace-nowrap"
            >
              {cat === "all" ? "All" : cat}
            </Button>
          ))}
        </div>

        <div className="space-y-3">
          {filteredProducts.map(product => (
            <Card key={product.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{product.name}</h3>
                    {product.quantity < product.min_stock && (
                      <Badge variant="destructive" className="bg-warning text-warning-foreground">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Low
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{product.barcode}</p>
                  <Badge variant="secondary" className="mt-1">{product.category}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditingProduct(product);
                    setIsDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Buy: </span>
                  <span className="font-medium">${product.buy_price.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sell: </span>
                  <span className="font-medium">${product.sell_price.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjustQuantity(product.id, -1)}
                  disabled={product.quantity <= 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center">
                  <div className="text-2xl font-bold text-foreground">{product.quantity}</div>
                  <div className="text-xs text-muted-foreground">in stock</div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjustQuantity(product.id, 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No products found
          </div>
        )}
      </div>
    </Layout>
  );
}
