import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createProduct } from '../storage/database';
import type { RootStackParamList } from '../navigation/types';

const ProductFormScreen = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'ProductForm'>) => {
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing info', 'Name is required.');
      return;
    }

    try {
      setSaving(true);
      await createProduct({
        name,
        barcode,
        category,
        buy_price: Number(buyPrice) || 0,
        sell_price: Number(sellPrice) || 0,
        quantity: Number(quantity) || 0,
        min_stock: Number(minStock) || 5
      });
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save product.';
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Hot sauce" />
      <Text style={styles.label}>Barcode</Text>
      <TextInput style={styles.input} value={barcode} onChangeText={setBarcode} placeholder="123456789" />
      <Text style={styles.label}>Category</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Condiments" />
      <Text style={styles.label}>Buy price</Text>
      <TextInput style={styles.input} value={buyPrice} onChangeText={setBuyPrice} keyboardType="decimal-pad" placeholder="0" />
      <Text style={styles.label}>Sell price</Text>
      <TextInput style={styles.input} value={sellPrice} onChangeText={setSellPrice} keyboardType="decimal-pad" placeholder="0" />
      <Text style={styles.label}>Initial quantity</Text>
      <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="0" />
      <Text style={styles.label}>Minimum stock</Text>
      <TextInput style={styles.input} value={minStock} onChangeText={setMinStock} keyboardType="number-pad" placeholder="5" />
      <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save product'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 14
  },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  }
});

export default ProductFormScreen;
