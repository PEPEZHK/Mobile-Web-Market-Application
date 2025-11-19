import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { adjustProductQuantity, fetchProducts } from '../storage/database';
import type { Product } from '../types';

const InventoryScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const rows = await fetchProducts();
    setProducts(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts])
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return products;
    }
    return products.filter((product) =>
      product.name.toLowerCase().includes(term) ||
      (product.barcode ? product.barcode.toLowerCase().includes(term) : false)
    );
  }, [products, search]);

  const handleAdjust = async (id: number, delta: number) => {
    await adjustProductQuantity(id, delta);
    setProducts((prev) =>
      prev.map((product) =>
        product.id === id
          ? { ...product, quantity: Math.max(product.quantity + delta, 0) }
          : product
      )
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Inventory</Text>
      <TextInput
        placeholder="Search by name or barcode"
        style={styles.search}
        value={search}
        onChangeText={setSearch}
      />
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardMeta}>{item.category || 'Uncategorized'}</Text>
                </View>
                <Text style={[styles.quantity, item.quantity <= item.min_stock && styles.lowStock]}>
                  {item.quantity} pcs
                </Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.price}>Sell: ${item.sell_price?.toFixed(2)}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.adjustButton} onPress={() => handleAdjust(item.id, -1)}>
                    <Text style={styles.adjustText}>-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.adjustButton} onPress={() => handleAdjust(item.id, 1)}>
                    <Text style={styles.adjustText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No products yet. Add your first item.</Text>}
          contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : undefined}
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ProductForm')}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12
  },
  search: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  card: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600'
  },
  cardMeta: {
    fontSize: 13,
    color: '#667085'
  },
  quantity: {
    fontSize: 16,
    fontWeight: '600'
  },
  lowStock: {
    color: '#b42318'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  price: {
    fontWeight: '600'
  },
  actions: {
    flexDirection: 'row',
    gap: 8
  },
  adjustButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    alignItems: 'center',
    justifyContent: 'center'
  },
  adjustText: {
    fontSize: 18,
    fontWeight: '700'
  },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    color: '#667085'
  },
  emptyContainer: {
    flexGrow: 1
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4
  },
  fabText: {
    color: 'white',
    fontSize: 32,
    lineHeight: 32
  }
});

export default InventoryScreen;
