import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { createShoppingList } from '../storage/database';

const ShoppingListFormScreen = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'ShoppingListForm'>) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<'restock' | 'customer_order'>('restock');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing info', 'List title is required.');
      return;
    }

    try {
      setSaving(true);
      const newId = await createShoppingList({ title, notes, type, priority });
      navigation.replace('ShoppingListDetail', { listId: newId, title });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create list.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const buildChoice = <T extends string>(value: T, current: T, label: string, onPress: (next: T) => void) => (
    <TouchableOpacity
      key={value}
      style={[styles.choice, current === value && styles.choiceActive]}
      onPress={() => onPress(value)}
    >
      <Text style={[styles.choiceText, current === value && styles.choiceTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Saturday restock" />
      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Add optional notes"
        multiline
      />
      <Text style={styles.label}>Type</Text>
      <View style={styles.choiceRow}>
        {buildChoice('restock', type, 'Restock', setType)}
        {buildChoice('customer_order', type, 'Customer order', setType)}
      </View>
      <Text style={styles.label}>Priority</Text>
      <View style={styles.choiceRow}>
        {(['low', 'medium', 'high'] as const).map((value) =>
          buildChoice(value, priority, value.charAt(0).toUpperCase() + value.slice(1), setPriority)
        )}
      </View>
      <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Creating…' : 'Create list'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  label: {
    fontWeight: '600',
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    fontSize: 16
  },
  multiline: {
    height: 100,
    textAlignVertical: 'top'
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16
  },
  choice: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    alignItems: 'center'
  },
  choiceActive: {
    backgroundColor: '#eef4ff',
    borderColor: '#1d4ed8'
  },
  choiceText: {
    fontWeight: '500'
  },
  choiceTextActive: {
    color: '#1d4ed8'
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
    fontSize: 16,
    fontWeight: '600'
  }
});

export default ShoppingListFormScreen;
