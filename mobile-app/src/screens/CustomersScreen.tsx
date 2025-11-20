import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { Customer } from '../types';
import {
  createCustomer,
  deleteCustomer,
  fetchCustomerSummary,
  fetchCustomers,
  fetchTransactionsWithItems,
  toggleTransactionPaymentStatus,
  updateCustomer
} from '../storage/database';
import { shareCsv } from '../lib/export';
import { useTranslation } from '../hooks/useTranslation';
import TopBar from '../components/TopBar';
import { useTheme } from '../hooks/useTheme';

const CustomersScreen = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [summaries, setSummaries] = useState<Record<number, { total: number; paid: number; debt: number }>>({});
  const [transactions, setTransactions] = useState<
    Record<number, Awaited<ReturnType<typeof fetchTransactionsWithItems>>>
  >({});
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const { t } = useTranslation();
  const { colors } = useTheme();

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const rows = await fetchCustomers();
    setCustomers(rows);
    const statsEntries = await Promise.all(
      rows.map(async (row) => {
        const stats = await fetchCustomerSummary(row.id);
        return [row.id, stats ?? { total: 0, paid: 0, debt: 0 }] as const;
      })
    );
    setSummaries(Object.fromEntries(statsEntries));
    setLoading(false);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await loadCustomers();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [loadCustomers])
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.phone ? c.phone.toLowerCase().includes(term) : false)
    );
  }, [customers, search]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert(t('customers.form.name', { defaultValue: 'Missing info' }), t('customers.form.name', { defaultValue: 'Customer name is required.' }));
      return;
    }

    try {
      if (editingId) {
        await updateCustomer(editingId, form);
        Alert.alert(t('customers.dialog.edit', { defaultValue: 'Edit customer' }), t('customers.toast.updated', { defaultValue: 'Customer updated.' }));
      } else {
        await createCustomer(form);
        Alert.alert(t('customers.dialog.add', { defaultValue: 'Add customer' }), t('customers.toast.added', { defaultValue: 'Customer created.' }));
      }
      setForm({ name: '', phone: '', notes: '' });
      setEditingId(null);
      await loadCustomers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save customer.';
      Alert.alert(t('customers.title'), message);
    }
  };

  const handleDelete = (customer: Customer) => {
    Alert.alert(t('customers.dialog.add', { defaultValue: 'Delete customer' }), t('customers.confirm.delete', { defaultValue: `Remove ${customer.name} and related records?`, values: { name: customer.name } }), [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: t('customers.actions.deleteAll', { defaultValue: 'Delete' }),
        style: 'destructive',
        onPress: async () => {
          await deleteCustomer(customer.id);
          if (expanded === customer.id) {
            setExpanded(null);
          }
          await loadCustomers();
        }
      }
    ]);
  };

  const toggleExpand = async (customerId: number) => {
    const nextId = expanded === customerId ? null : customerId;
    setExpanded(nextId);
    if (nextId) {
      const rows = await fetchTransactionsWithItems(customerId);
      setTransactions((prev) => ({ ...prev, [customerId]: rows }));
    }
  };

  const handleToggleStatus = async (customerId: number, transactionId: number) => {
    await toggleTransactionPaymentStatus(transactionId);
    const [stats, txs] = await Promise.all([
      fetchCustomerSummary(customerId),
      fetchTransactionsWithItems(customerId)
    ]);
    setSummaries((prev) => ({ ...prev, [customerId]: stats ?? { total: 0, paid: 0, debt: 0 } }));
    setTransactions((prev) => ({ ...prev, [customerId]: txs }));
  };

  const exportAll = async () => {
    if (customers.length === 0) {
      Alert.alert(t('customers.title'), t('customers.toast.noExport', { defaultValue: 'No customers to export.' }));
      return;
    }
    const headers = [
      t('customers.export.columns.customerId', { defaultValue: 'Customer ID' }),
      t('customers.export.columns.customerName', { defaultValue: 'Customer Name' }),
      t('customers.export.columns.phone', { defaultValue: 'Phone' }),
      t('customers.export.columns.notes', { defaultValue: 'Notes' })
    ];
    const rows = customers.map((c) => [c.id, c.name, c.phone ?? '-', c.notes ?? '-']);
    await shareCsv('customers.csv', headers, rows);
  };

  const exportSingle = async (customerId: number) => {
    const txs = transactions[customerId] ?? (await fetchTransactionsWithItems(customerId));
    if (!txs.length) {
      Alert.alert(t('customers.title'), t('customers.noTransactions', { defaultValue: 'No transactions yet.' }));
      return;
    }
    const headers = [
      t('customers.export.columns.transactionId', { defaultValue: 'Transaction ID' }),
      t('customers.export.columns.date', { defaultValue: 'Date' }),
      t('customers.export.columns.status', { defaultValue: 'Payment Status' }),
      t('customers.export.columns.transactionTotal', { defaultValue: 'Total' })
    ];
    const rows = txs.map((tx) => [
      tx.id,
      new Date(tx.date).toLocaleString(),
      tx.payment_status,
      tx.total_amount
    ]);
    await shareCsv(`customer_${customerId}_transactions.csv`, headers, rows);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <TopBar />
      <Text style={[styles.heading, { color: colors.text }]}>{t('customers.title')}</Text>

      <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colors.text + '22' }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{editingId ? t('customers.dialog.edit', { defaultValue: 'Edit customer' }) : t('customers.dialog.add', { defaultValue: 'Add customer' })}</Text>
        <TextInput
          placeholder={t('customers.form.name', { defaultValue: 'Name' })}
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.input, color: colors.text }]}
          value={form.name}
          onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
          placeholderTextColor={colors.muted}
        />
        <TextInput
          placeholder={t('customers.form.phone', { defaultValue: 'Phone' })}
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.input, color: colors.text }]}
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(text) => setForm((prev) => ({ ...prev, phone: text }))}
          placeholderTextColor={colors.muted}
        />
        <TextInput
          placeholder={t('customers.form.notes', { defaultValue: 'Notes' })}
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.input, color: colors.text }]}
          value={form.notes}
          onChangeText={(text) => setForm((prev) => ({ ...prev, notes: text }))}
          placeholderTextColor={colors.muted}
        />
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleSave}>
          <Text style={[styles.buttonText, { color: colors.buttonText }]}>{editingId ? t('customers.dialog.edit', { defaultValue: 'Update' }) : t('customers.form.save', { defaultValue: 'Save customer' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.buttonOutline, { borderColor: colors.border }]} onPress={exportAll}>
          <Text style={[styles.buttonOutlineText, { color: colors.text }]}>{t('customers.export.all', { defaultValue: 'Export all' })}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colors.text + '22', flex: 1 }]}>
        <TextInput
          placeholder={t('customers.search', { defaultValue: 'Search customers' })}
          value={search}
          onChangeText={setSearch}
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.input, color: colors.text }]}
          placeholderTextColor={colors.muted}
        />
        {loading ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            refreshing={refreshing}
            onRefresh={refresh}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const summary = summaries[item.id] ?? { total: 0, paid: 0, debt: 0 };
              return (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.text + '22' }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.flex}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                      {item.phone && <Text style={[styles.cardMeta, { color: colors.muted }]}>{item.phone}</Text>}
                      {item.notes && <Text style={[styles.cardMeta, { color: colors.muted }]}>{item.notes}</Text>}
                    </View>
                    <View style={styles.row}>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => {
                          setEditingId(item.id);
                          setForm({ name: item.name, phone: item.phone || '', notes: item.notes || '' });
                        }}
                      >
                        <Text style={styles.iconText}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconButton} onPress={() => exportSingle(item.id)}>
                        <Text style={styles.iconText}>⇩</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconButton} onPress={() => handleDelete(item)}>
                        <Text style={[styles.iconText, styles.danger]}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.summaryRow}>
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('sales.total', { defaultValue: 'Total' })}</Text>
                      <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.total.toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('sales.paid', { defaultValue: 'Paid' })}</Text>
                      <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.paid.toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryLabel, { color: colors.danger }]}>{t('sales.debt', { defaultValue: 'Debt' })}</Text>
                      <Text style={[styles.summaryValue, { color: colors.danger }]}>{summary.debt.toFixed(2)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.link} onPress={() => toggleExpand(item.id)}>
                    <Text style={[styles.linkText, { color: colors.accent }]}>
                      {expanded === item.id ? t('customers.transactions.hide', { defaultValue: 'Hide transactions' }) : t('customers.transactions.view', { defaultValue: 'View transactions' })}
                    </Text>
                  </TouchableOpacity>

                  {expanded === item.id && (
                    <View style={styles.transactions}>
                      {(transactions[item.id] ?? []).map((tx) => (
                        <View key={tx.id} style={styles.transactionCard}>
                          <View style={styles.transactionHeader}>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{`#${tx.id}`}</Text>
                            <TouchableOpacity
                              style={[
                                styles.badge,
                                tx.payment_status === 'debt' && styles.badgeDanger
                              ]}
                              onPress={() => handleToggleStatus(item.id, tx.id)}
                            >
                              <Text
                                style={[
                                  styles.badgeText,
                                  tx.payment_status === 'debt' && styles.danger
                                ]}
                              >
                                {tx.payment_status === 'debt' ? t('customers.status.debt', { defaultValue: 'Debt' }) : t('customers.status.paid', { defaultValue: 'Paid' })}
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={[styles.cardMeta, { color: colors.muted }]}>{new Date(tx.date).toLocaleString()}</Text>
                          <Text style={[styles.summaryValue, { color: colors.text }]}>{`$${tx.total_amount.toFixed(2)}`}</Text>
                          <View style={styles.itemsList}>
                            {tx.items.map((itemRow, idx) => (
                              <Text key={`${tx.id}-${idx}`} style={[styles.cardMeta, { color: colors.muted }]}>
                                {itemRow.product_name} • {itemRow.quantity} × ${itemRow.unit_price.toFixed(2)}
                              </Text>
                            ))}
                            {tx.items.length === 0 && (
                              <Text style={[styles.cardMeta, { color: colors.muted }]}>{t('history.detail.noItems', { defaultValue: 'No items recorded' })}</Text>
                            )}
                          </View>
                        </View>
                      ))}
                      {(transactions[item.id] ?? []).length === 0 && (
                        <Text style={[styles.cardMeta, { color: colors.muted }]}>{t('customers.noTransactions', { defaultValue: 'No transactions yet.' })}</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={[styles.helper, { color: colors.muted }]}>{t('customers.empty', { defaultValue: 'No customers yet.' })}</Text>}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 16
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  button: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  buttonText: {
    color: 'white',
    fontWeight: '700'
  },
  buttonOutline: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonOutlineText: {
    fontWeight: '700'
  },
  card: {
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 16
  },
  cardMeta: {
    color: '#475467',
    marginTop: 4
  },
  row: {
    flexDirection: 'row',
    gap: 8
  },
  iconButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8
  },
  iconText: {
    fontWeight: '700'
  },
  danger: {
    color: '#b42318'
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  summaryItem: {
    flex: 1
  },
  summaryLabel: {
    color: '#475467',
    fontSize: 12
  },
  summaryValue: {
    fontWeight: '700',
    fontSize: 16
  },
  link: {
    marginTop: 10
  },
  linkText: {
    color: '#2563eb',
    fontWeight: '600'
  },
  transactions: {
    marginTop: 10,
    gap: 8
  },
  transactionCard: {
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 10,
    padding: 10
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eef4ff'
  },
  badgeDanger: {
    backgroundColor: '#fee4e2'
  },
  badgeText: {
    fontWeight: '700',
    color: '#1d4ed8'
  },
  itemsList: {
    marginTop: 8,
    gap: 4
  },
  helper: {
    color: '#667085',
    textAlign: 'center'
  },
  flex: {
    flex: 1
  }
});

export default CustomersScreen;
