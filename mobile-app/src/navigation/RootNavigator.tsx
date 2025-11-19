import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import HomeTabs from './HomeTabs';
import type { RootStackParamList } from './types';
import LoginScreen from '../screens/LoginScreen';
import ProductFormScreen from '../screens/ProductFormScreen';
import ShoppingListFormScreen from '../screens/ShoppingListFormScreen';
import ShoppingListDetailScreen from '../screens/ShoppingListDetailScreen';
import FullScreenLoader from '../components/FullScreenLoader';
import { useDatabase } from '../hooks/useDatabase';
import { useAuth } from '../hooks/useAuth';

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const { ready } = useDatabase();
  const { user, initializing } = useAuth();

  const isLoading = useMemo(() => !ready || initializing, [ready, initializing]);

  if (isLoading) {
    return <FullScreenLoader />;
  }

  return (
    <Stack.Navigator>
      {user ? (
        <>
          <Stack.Screen
            name="HomeTabs"
            component={HomeTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ProductForm"
            component={ProductFormScreen}
            options={{ title: 'Add product' }}
          />
          <Stack.Screen
            name="ShoppingListForm"
            component={ShoppingListFormScreen}
            options={{ title: 'New list' }}
          />
          <Stack.Screen
            name="ShoppingListDetail"
            component={ShoppingListDetailScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
        </>
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
};

export default RootNavigator;
