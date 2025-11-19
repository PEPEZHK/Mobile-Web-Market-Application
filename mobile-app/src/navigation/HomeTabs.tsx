import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import InventoryScreen from '../screens/InventoryScreen';
import ShoppingListsScreen from '../screens/ShoppingListsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { HomeTabParamList } from './types';

const Tab = createBottomTabNavigator<HomeTabParamList>();
type IconName = keyof typeof Ionicons.glyphMap;

const HomeTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const name: IconName = (() => {
            switch (route.name) {
              case 'Inventory':
                return 'cube-outline';
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
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="ShoppingLists" component={ShoppingListsScreen} options={{ title: 'Lists' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default HomeTabs;
