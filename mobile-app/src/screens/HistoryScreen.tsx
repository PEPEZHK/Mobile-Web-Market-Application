import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchTransactionsWithItems } from '../storage/database';
import { shareCsv } from '../lib/export';
import { useTranslation } from '../hooks/useTranslation';
import TopBar from '../components/TopBar';
import { useTheme } from '../hooks/useTheme';

const HistoryScreen = () => {
  const [transactions, setTransactions] = useState<Awaited<ReturnType<typeof fetchTransactionsWithItems>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { t } = useTranslation();
  const { colors } = useTheme();

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchTransactionsWithItems();
    setTransactions(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return transactions;
    return transactions.filter((tx) => {
      const productMatch = tx.items.some((item) =>
        item.product_name.toLowerCase().includes(term)
      );
      const customerMatch = tx.customer_name?.toLowerCase().includes(term);
      const idMatch = tx.id.toString().includes(term);
      return productMatch || customerMatch || idMatch;
    });
  }, [transactions, search]);

  const exportAll = async () => {
    if (filtered.length === 0) {
      return;
    }
    const headers = [
      t('customers.export.columns.transactionId', { defaultValue: 'Transaction ID' }),
      t('customers.export.columns.date', { defaultValue: 'Date' }),
      t('customers.export.columns.customer', { defaultValue: 'Customer' }),
      t('customers.export.columns.status', { defaultValue: 'Status' }),
      t('customers.export.columns.transactionTotal', { defaultValue: 'Total' })
    ];
    const rows = filtered.map((tx) => [
      tx.id,
      new Date(tx.date).toLocaleString(),
      tx.customer_name ?? '-',
      tx.payment_status,
      tx.total_amount
    ]);
    await shareCsv('history.csv', headers, rows);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TopBar />
      <Text style={[styles.heading, { color: colors.text }]}>{t('history.title', { defaultValue: 'History' })}</Text>
      <TextInput
        placeholder={t('history.search', { defaultValue: 'Search by product, customer, or ID' })}
        value={search}
        onChangeText={setSearch}
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
      />
      <TouchableOpacity style={styles.button} onPress={exportAll}>
        <Text style={styles.buttonText}>{t('export.share', { defaultValue: 'Share' })}</Text>
      </TouchableOpacity>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>#{item.id}</Text>
                <Text style={styles.cardMeta}>{new Date(item.date).toLocaleString()}</Text>
                {item.customer_name && <Text style={styles.cardMeta}>{item.customer_name}</Text>}
              </View>
              <View style={styles.alignEnd}>
                <Text
                  style={[
                    styles.badge,
                    item.payment_status === 'debt' && styles.badgeDanger
                  ]}
                >
                  {item.payment_status === 'debt' ? 'Debt' : 'Paid'}
                </Text>
                <Text style={styles.total}>${item.total_amount.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.items}>
              {item.items.map((row, idx) => (
                <Text key={`${item.id}-${idx}`} style={styles.cardMeta}>
                  {row.product_name} • {row.quantity} × ${row.unit_price.toFixed(2)}
                </Text>
              ))}
              {item.items.length === 0 && (
                <Text style={styles.cardMeta}>No items stored for this sale.</Text>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.helper}>No transactions found.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700'
  },
  cardMeta: {
    color: '#475467',
    marginTop: 2
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eef4ff',
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 70
  },
  badgeDanger: {
    backgroundColor: '#fee4e2'
  },
  total: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800'
  },
  items: {
    marginTop: 8,
    gap: 4
  },
  helper: {
    color: '#667085',
    textAlign: 'center'
  },
  alignEnd: {
    alignItems: 'flex-end'
  },
  button: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8
  },
  buttonText: {
    fontWeight: '700'
  }
});

export default HistoryScreen;
