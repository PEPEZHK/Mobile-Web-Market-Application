export interface Product {
  id: number;
  name: string;
  barcode: string | null;
  category: string | null;
  buy_price: number;
  sell_price: number;
  quantity: number;
  min_stock: number;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
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

export interface ShoppingListWithStats extends ShoppingList {
  customer_name: string | null;
  pending_count: number;
  completed_count: number;
  estimated_total: number;
  pending_estimated_total: number;
}

export interface ShoppingListItem {
  id: number;
  list_id: number;
  product_id: number | null;
  name: string;
  quantity_value: number;
  quantity_label: string | null;
  estimated_unit_cost: number;
  notes: string | null;
  is_completed: number;
  created_at: string;
}

export interface ShoppingListItemWithProduct extends ShoppingListItem {
  product_name: string | null;
  product_quantity: number | null;
}

export interface User {
  id: number;
  nickname: string;
  password: string;
  created_at: string;
}
