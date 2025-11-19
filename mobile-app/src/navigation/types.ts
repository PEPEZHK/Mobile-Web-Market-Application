export type RootStackParamList = {
  Login: undefined;
  HomeTabs: undefined;
  ProductForm: undefined;
  ShoppingListForm: { listId?: number } | undefined;
  ShoppingListDetail: { listId: number; title: string };
};

export type HomeTabParamList = {
  Inventory: undefined;
  ShoppingLists: undefined;
  Settings: undefined;
};
