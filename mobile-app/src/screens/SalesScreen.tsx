import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { CartItem, Customer, Product } from '../types';
import {
  createCustomer,
  createTransaction,
  fetchCustomerSummary,
  fetchCustomers,
  fetchProducts,
  fetchSalesSummary
} from '../storage/database';
import TopBar from '../components/TopBar';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';

const SalesScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleType, setSaleType] = useState<'fully_paid' | 'debt'>('fully_paid');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [salesSummary, setSalesSummary] = useState({ total: 0, paid: 0, debt: 0 });
  const [customerSummary, setCustomerSummary] = useState({ total: 0, paid: 0, debt: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', notes: '' });
  const { colors } = useTheme();
  const { t } = useTranslation();

  const loadData = useCallback(async () => {
    setLoading(true);
    const [prods, custs, summary] = await Promise.all([
      fetchProducts(),
      fetchCustomers(),
      fetchSalesSummary()
    ]);
    const inStock = prods.filter((p) => p.quantity > 0);
    setProducts(inStock);
    setCustomers(custs);
    setSalesSummary(summary ?? { total: 0, paid: 0, debt: 0 });

    if (custs.length === 0) {
      setSelectedCustomerId(null);
      setCustomerSummary({ total: 0, paid: 0, debt: 0 });
    } else {
      setSelectedCustomerId((prev) => {
        const stillExists = prev && custs.find((c) => c.id === prev);
        return stillExists ? prev : custs[0].id;
      });
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useFocusEffect(
    useCallback(() => {
      if (selectedCustomerId) {
        fetchCustomerSummary(selectedCustomerId).then((summary) => {
          setCustomerSummary(summary ?? { total: 0, paid: 0, debt: 0 });
        });
      } else {
        setCustomerSummary({ total: 0, paid: 0, debt: 0 });
        if (saleType === 'debt') {
          setSaleType('fully_paid');
        }
      }
    }, [selectedCustomerId, saleType])
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.barcode ? p.barcode.toLowerCase().includes(term) : false)
    );
  }, [products, search]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          Alert.alert('No stock', 'This product has no remaining stock.');
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: number, next: number) => {
    setCart((prev) => {
      if (next <= 0) {
        return prev.filter((item) => item.product.id !== productId);
      }
      return prev.map((item) => {
        if (item.product.id !== productId) return item;
        const maxQty = item.product.quantity;
        if (next > maxQty) {
          Alert.alert('No stock', 'Quantity exceeds available stock.');
          return item;
        }
        return { ...item, quantity: next };
      });
    });
  };

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.sell_price * item.quantity, 0),
    [cart]
  );

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert('Cart empty', 'Add at least one product.');
      return;
    }
    if (!selectedCustomerId) {
      Alert.alert('Select customer', 'Choose a customer before completing the sale.');
      return;
    }

    try {
      setSaving(true);
      await createTransaction({
        customerId: selectedCustomerId,
        paymentStatus: saleType,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.product.sell_price
        }))
      });
      setCart([]);
      setSaleType('fully_paid');
      await loadData();
      Alert.alert('Sale saved', 'Transaction completed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete sale.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!customerForm.name.trim()) {
      Alert.alert('Missing info', 'Customer name is required.');
      return;
    }
    try {
      const newId = await createCustomer(customerForm);
      setCustomerForm({ name: '', phone: '', notes: '' });
      await loadData();
      setSelectedCustomerId(newId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create customer.';
      Alert.alert('Error', message);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <TopBar />
      <Text style={[styles.heading, { color: colors.text }]}>{t('sales.title', { defaultValue: 'Sales' })}</Text>

      <View style={styles.summaryGrid}>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, shadowColor: colors.text + '22' }]}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('sales.total', { defaultValue: 'Total' })}</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{`$${salesSummary.total.toFixed(2)}`}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, shadowColor: colors.text + '22' }]}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('sales.paid', { defaultValue: 'Paid' })}</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{`$${salesSummary.paid.toFixed(2)}`}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, shadowColor: colors.text + '22' }]}>
          <Text style={[styles.summaryLabel, { color: colors.danger }]}>{t('sales.debt', { defaultValue: 'Debt' })}</Text>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>{`$${salesSummary.debt.toFixed(2)}`}</Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colors.text + '22' }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('sales.customer', { defaultValue: 'Customer' })}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.customerRow}>
          {customers.map((customer) => (
            <TouchableOpacity
              key={customer.id}
              style={[
                styles.chip,
                { borderColor: colors.border },
                selectedCustomerId === customer.id && [styles.chipActive, { backgroundColor: colors.accent + '22', borderColor: colors.accent }]
              ]}
              onPress={() => setSelectedCustomerId(customer.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.text },
                  selectedCustomerId === customer.id && styles.chipTextActive
                ]}
              >
                {customer.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {customers.length === 0 && (
          <Text style={[styles.helper, { color: colors.muted }]}>{t('sales.customer.none', { defaultValue: 'Add a customer to start selling.' })}</Text>
        )}

        <View style={styles.formRow}>
          <TextInput
            placeholder="Name"
            value={customerForm.name}
            onChangeText={(text) => setCustomerForm((prev) => ({ ...prev, name: text }))}
          style={[styles.input, styles.flex, { borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.muted}
        />
        <TextInput
          placeholder="Phone"
          keyboardType="phone-pad"
          value={customerForm.phone}
          onChangeText={(text) => setCustomerForm((prev) => ({ ...prev, phone: text }))}
          style={[styles.input, styles.flex, { borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.muted}
          />
        </View>
        <TextInput
          placeholder="Notes"
          value={customerForm.notes}
          onChangeText={(text) => setCustomerForm((prev) => ({ ...prev, notes: text }))}
          style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.muted}
        />
        <TouchableOpacity style={[styles.buttonSecondary, { borderColor: colors.border }]} onPress={handleCreateCustomer}>
          <Text style={[styles.buttonSecondaryText, { color: colors.text }]}>{t('customers.add', { defaultValue: 'Add customer' })}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colors.text + '22' }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('sales.saleType', { defaultValue: 'Sale type' })}</Text>
        <View style={styles.row}>
          {(['fully_paid', 'debt'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.toggle,
                { borderColor: colors.border },
                saleType === type && [styles.toggleActive, { backgroundColor: colors.accent + '22', borderColor: colors.accent }],
                type === 'debt' && !selectedCustomerId && styles.toggleDisabled]}
              disabled={type === 'debt' && !selectedCustomerId}
              onPress={() => setSaleType(type)}
            >
              <Text style={[styles.toggleText, { color: colors.text }, saleType === type && { color: colors.accent }]}>
                {type === 'fully_paid' ? t('sales.saleType.paid', { defaultValue: 'Fully paid' }) : t('sales.saleType.debt', { defaultValue: 'Debt' })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {selectedCustomerId ? (
          <View style={styles.customerSummary}>
            <Text style={[styles.helper, { color: colors.muted }]}>{t('sales.customerTotal', { defaultValue: 'Customer totals' })}</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('sales.total')}</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{`$${customerSummary.total.toFixed(2)}`}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('sales.paid')}</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{`$${customerSummary.paid.toFixed(2)}`}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryLabel, { color: colors.danger }]}>{t('sales.debt')}</Text>
                <Text style={[styles.summaryValue, { color: colors.danger }]}>{`$${customerSummary.debt.toFixed(2)}`}</Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={[styles.helper, { color: colors.muted }]}>{t('sales.debtNote', { defaultValue: 'Select a customer to track debt sales.' })}</Text>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colors.text + '22' }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('sales.openCatalog', { defaultValue: 'Catalog' })}</Text>
        <TextInput
          placeholder={t('sales.searchProducts', { defaultValue: 'Search products' })}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={colors.muted}
          style={[styles.input, { borderColor: colors.border, color: colors.text }]}
        />
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => addToCart(item)}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.cardMeta, { color: colors.muted }]}>
                  {item.quantity} in stock • ${item.sell_price.toFixed(2)}
                </Text>
              </View>
              <Text style={[styles.action, { color: colors.accent }]}>{t('sales.openCatalog', { defaultValue: 'Add' })}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={[styles.helper, { color: colors.muted }]}>{t('depot.empty', { defaultValue: 'No products available.' })}</Text>}
          scrollEnabled={false}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cart</Text>
        {cart.length === 0 && <Text style={styles.helper}>Add items to build a cart.</Text>}
        {cart.map((item) => (
          <View key={item.product.id} style={styles.cartRow}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{item.product.name}</Text>
              <Text style={styles.cardMeta}>${item.product.sell_price.toFixed(2)} each</Text>
            </View>
            <View style={styles.qtyControls}>
              <TouchableOpacity style={styles.qtyButton} onPress={() => updateQuantity(item.product.id, item.quantity - 1)}>
                <Text style={styles.qtyText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{item.quantity}</Text>
              <TouchableOpacity style={styles.qtyButton} onPress={() => updateQuantity(item.product.id, item.quantity + 1)}>
                <Text style={styles.qtyText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.lineTotal}>${(item.product.sell_price * item.quantity).toFixed(2)}</Text>
          </View>
        ))}
        {cart.length > 0 && (
          <View style={styles.totalRow}>
            <View>
              <Text style={styles.helper}>Order total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleCheckout}
              disabled={saving}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Complete sale'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.buttonGhost}
        onPress={() => navigation.navigate('History')}
      >
        <Text style={styles.buttonGhostText}>View history</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16
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
  summaryGrid: {
    flexDirection: 'row',
    gap: 12
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  summaryLabel: {
    color: '#475467',
    fontSize: 13
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700'
  },
  debtLabel: {
    color: '#b42318'
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10
  },
  customerRow: {
    marginBottom: 12
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    marginRight: 8
  },
  chipActive: {
    backgroundColor: '#eef4ff',
    borderColor: '#1d4ed8'
  },
  chipText: {
    fontWeight: '600'
  },
  chipTextActive: {
    color: '#1d4ed8'
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  helper: {
    color: '#667085',
    fontSize: 13,
    marginBottom: 8
  },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: 'white',
    fontWeight: '700'
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonSecondaryText: {
    fontWeight: '600'
  },
  buttonGhost: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center'
  },
  buttonGhostText: {
    color: '#2563eb',
    fontWeight: '600'
  },
  row: {
    flexDirection: 'row',
    gap: 8
  },
  toggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center'
  },
  toggleDisabled: {
    opacity: 0.6
  },
  toggleActive: {
    backgroundColor: '#eef4ff',
    borderColor: '#1d4ed8'
  },
  toggleText: {
    fontWeight: '600'
  },
  toggleTextActive: {
    color: '#1d4ed8'
  },
  customerSummary: {
    marginTop: 12
  },
  card: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e7ec',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  cardTitle: {
    fontWeight: '700'
  },
  cardMeta: {
    color: '#475467',
    marginTop: 4
  },
  action: {
    color: '#2563eb',
    fontWeight: '700'
  },
  cartRow: {
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8
  },
  qtyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    alignItems: 'center',
    justifyContent: 'center'
  },
  qtyText: {
    fontSize: 20,
    fontWeight: '700'
  },
  qtyValue: {
    fontWeight: '700'
  },
  lineTotal: {
    marginTop: 8,
    fontWeight: '700'
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800'
  },
  formRow: {
    flexDirection: 'row',
    gap: 8
  },
  flex: {
    flex: 1
  }
});

export default SalesScreen;
