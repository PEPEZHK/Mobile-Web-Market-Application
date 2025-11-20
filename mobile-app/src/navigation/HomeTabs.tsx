import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import InventoryScreen from '../screens/InventoryScreen';
import ShoppingListsScreen from '../screens/ShoppingListsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SalesScreen from '../screens/SalesScreen';
import CustomersScreen from '../screens/CustomersScreen';
import type { HomeTabParamList } from './types';
import { useTheme } from '../hooks/useTheme';

const Tab = createBottomTabNavigator<HomeTabParamList>();
type IconName = keyof typeof Ionicons.glyphMap;

const HomeTabs = () => {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, size }) => {
          const name: IconName = (() => {
            switch (route.name) {
              case 'Sales':
                return 'cart-outline';
              case 'Inventory':
                return 'cube-outline';
              case 'Customers':
                return 'people-outline';
              case 'ShoppingLists':
                return 'list-outline';
              case 'Settings':
                return 'settings-outline';
              default:
                return 'ellipse';
            }
          })();
          return <Ionicons name={name} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Sales" component={SalesScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Customers" component={CustomersScreen} />
      <Tab.Screen name="ShoppingLists" component={ShoppingListsScreen} options={{ title: 'Lists' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default HomeTabs;
