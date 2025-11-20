export type RootStackParamList = {
  Login: undefined;
  HomeTabs: undefined;
  ProductForm: undefined;
  ShoppingListForm: { listId?: number } | undefined;
  ShoppingListDetail: { listId: number; title: string };
  History: undefined;
};

export type HomeTabParamList = {
  Sales: undefined;
  Inventory: undefined;
  Customers: undefined;
  ShoppingLists: undefined;
  Settings: undefined;
};
