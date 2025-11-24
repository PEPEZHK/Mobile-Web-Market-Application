export interface Product {
  id: number;
  name: string;
  barcode: string;
  category: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  min_stock: number;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  notes: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  date: string;
  customer_id: number | null;
  total_amount: number;
  payment_status: 'debt' | 'fully_paid';
}

export interface TransactionItem {
  id: number;
  transaction_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface ShoppingList {
  id: number;
  title: string;
  type: 'restock' | 'customer_order';
  status: 'active' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high';
  notes: string | null;
  customer_id: number | null;
  due_date: string | null;
  created_at: string;
}

export interface ShoppingListItem {
  id: number;
  list_id: number;
  product_id: number | null;
  name: string;
  quantity_value: number;
  quantity_label: string | null;
  estimated_unit_cost: number;
  sell_price: number | null;
  category: string | null;
  notes: string | null;
  is_completed: number;
  created_at: string;
}

export interface ShoppingListWithStats extends ShoppingList {
  customer_name: string | null;
  pending_count: number;
  completed_count: number;
  estimated_total: number;
  pending_estimated_total: number;
}

export interface ShoppingListItemWithProduct extends ShoppingListItem {
  product_name: string | null;
  product_buy_price: number | null;
  product_sell_price?: number | null;
  product_quantity?: number | null;
  product_category?: string | null;
}

export interface User {
  id: number;
  nickname: string;
  password: string;
  created_at: string;
}
