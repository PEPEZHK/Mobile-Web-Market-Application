import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  addShoppingListItem,
  fetchShoppingList,
  fetchShoppingListItems,
  toggleShoppingListItem
} from '../storage/database';
import type { ShoppingList, ShoppingListItemWithProduct } from '../types';
import { useFocusEffect } from '@react-navigation/native';

const ShoppingListDetailScreen = ({ route }: NativeStackScreenProps<RootStackParamList, 'ShoppingListDetail'>) => {
  const { listId } = route.params;
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingListItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [estimated, setEstimated] = useState('0');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [listData, listItems] = await Promise.all([
      fetchShoppingList(listId),
      fetchShoppingListItems(listId)
    ]);
    setList(listData ?? null);
    setItems(listItems);
    setLoading(false);
  }, [listId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleAddItem = async () => {
    if (!newItem.trim()) {
      Alert.alert('Missing info', 'Item name is required.');
      return;
    }

    try {
      setSaving(true);
      await addShoppingListItem({
        listId,
        name: newItem,
        quantityValue: Number(quantity) || 1,
        estimatedUnitCost: Number(estimated) || 0
      });
      setNewItem('');
      setQuantity('1');
      setEstimated('0');
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add item.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (item: ShoppingListItemWithProduct) => {
    await toggleShoppingListItem(item.id, !item.is_completed);
    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, is_completed: item.is_completed ? 0 : 1 } : row))
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {list && (
        <View style={styles.meta}>
          <Text style={styles.metaTitle}>{list.title}</Text>
          <Text style={styles.metaText}>Priority: {list.priority}</Text>
          <Text style={styles.metaText}>Type: {list.type}</Text>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.itemRow} onPress={() => toggleItem(item)}>
            <View>
              <Text style={[styles.itemTitle, item.is_completed === 1 && styles.itemCompleted]}>
                {item.name}
              </Text>
              <Text style={styles.itemMeta}>
                Qty: {item.quantity_value} · Est: ${item.estimated_unit_cost.toFixed(2)}
              </Text>
            </View>
            <Text style={styles.checkbox}>{item.is_completed === 1 ? '✓' : ''}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No items yet. Add your first entry below.</Text>}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
      />
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Item name"
          value={newItem}
          onChangeText={setNewItem}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.rowInput]}
            placeholder="Qty"
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={setQuantity}
          />
          <TextInput
            style={[styles.input, styles.rowInput]}
            placeholder="Est. cost"
            keyboardType="decimal-pad"
            value={estimated}
            onChangeText={setEstimated}
          />
        </View>
        <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleAddItem} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Adding…' : 'Add item'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  meta: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e7ec'
  },
  metaTitle: {
    fontSize: 20,
    fontWeight: '700'
  },
  metaText: {
    color: '#475467'
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7'
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  itemCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8'
  },
  itemMeta: {
    color: '#667085'
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#d0d5dd',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '600'
  },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    color: '#667085'
  },
  emptyContainer: {
    flexGrow: 1
  },
  form: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e4e7ec'
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  rowInput: {
    flex: 1
  },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: 'white',
    fontWeight: '600'
  }
});

export default ShoppingListDetailScreen;
