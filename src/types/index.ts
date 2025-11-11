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
