import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchShoppingLists } from '../storage/database';
import type { ShoppingListWithStats } from '../types';
import type { RootStackParamList } from '../navigation/types';

const ShoppingListsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [lists, setLists] = useState<ShoppingListWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLists = useCallback(async () => {
    setLoading(true);
    const rows = await fetchShoppingLists();
    setLists(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLists();
    }, [loadLists])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLists();
    setRefreshing(false);
  };

  const openList = (list: ShoppingListWithStats) => {
    navigation.navigate('ShoppingListDetail', { listId: list.id, title: list.title });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Shopping lists</Text>
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => openList(item)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.badge}>{item.pending_count} open</Text>
              </View>
              <Text style={styles.cardMeta}>{item.notes || 'No notes yet'}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardFooterText}>Est. ${item.pending_estimated_total.toFixed(2)}</Text>
                <Text style={styles.cardFooterText}>{item.completed_count} completed</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Create your first list to keep restock plans offline.</Text>}
          contentContainerStyle={lists.length === 0 ? styles.emptyContainer : undefined}
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ShoppingListForm')}
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
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600'
  },
  badge: {
    backgroundColor: '#eef4ff',
    color: '#1d4ed8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '600'
  },
  cardMeta: {
    color: '#475467',
    marginBottom: 12
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  cardFooterText: {
    fontSize: 13,
    color: '#475467'
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

export default ShoppingListsScreen;
