import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import type { RootStackParamList } from '../navigation/types';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../hooks/useTranslation';
import TopBar from '../components/TopBar';

const SettingsScreen = () => {
  const { user, logout } = useAuth();
  const { refresh, reset } = useDatabase();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { language, setLanguage, availableLanguages } = useLanguage();
  const { t } = useTranslation();

  useEffect(() => {
    const subscription = NetInfo.addEventListener((state) => {
      setIsConnected(Boolean(state.isConnected));
    });
    return () => subscription();
  }, []);

  const confirmReset = () => {
    Alert.alert(t('settings.title', { defaultValue: 'Settings' }), t('settings.reset', { defaultValue: 'This removes every locally stored record. Continue?' }), [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: t('settings.reset', { defaultValue: 'Reset' }),
        style: 'destructive',
        onPress: async () => {
          await reset();
        }
      }
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TopBar />
      <View style={styles.card}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.nickname}</Text>
        <TouchableOpacity style={styles.button} onPress={logout}>
          <Text style={styles.buttonText}>{t('settings.signOut', { defaultValue: 'Sign out' })}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{t('settings.title', { defaultValue: 'Settings' })}</Text>
        <Text style={styles.label}>Connectivity</Text>
        <Text style={[styles.value, !isConnected && styles.warning]}>
          {isConnected === null ? 'Checking…' : isConnected ? 'Online' : 'Offline'}
        </Text>
        <Text style={styles.helper}>All actions are stored locally in SQLite so you can keep working without internet.</Text>
        <TouchableOpacity style={styles.buttonSecondary} onPress={refresh}>
          <Text style={styles.buttonSecondaryText}>Re-run schema migration</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.buttonSecondary, styles.dangerButton]} onPress={confirmReset}>
          <Text style={[styles.buttonSecondaryText, styles.dangerText]}>Reset local data</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonSecondary} onPress={() => navigation.navigate('History')}>
          <Text style={styles.buttonSecondaryText}>{t('settings.viewHistory', { defaultValue: 'View sales history' })}</Text>
        </TouchableOpacity>
        <Text style={[styles.label, styles.languageLabel]}>{t('settings.language', { defaultValue: 'Language' })}</Text>
        <View style={styles.languageRow}>
          {availableLanguages.map((lang) => (
            <TouchableOpacity
              key={lang.value}
              style={[styles.languageChip, language === lang.value && styles.languageChipActive]}
              onPress={() => setLanguage(lang.value)}
            >
              <Text
                style={[
                  styles.languageChipText,
                  language === lang.value && styles.languageChipTextActive
                ]}
              >
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  },
  label: {
    color: '#475467',
    fontSize: 13,
    textTransform: 'uppercase'
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12
  },
  warning: {
    color: '#b42318'
  },
  helper: {
    fontSize: 13,
    color: '#475467',
    marginBottom: 12
  },
  button: {
    marginTop: 8,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonText: {
    color: 'white',
    fontWeight: '600'
  },
  buttonSecondary: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    alignItems: 'center',
    marginBottom: 8
  },
  buttonSecondaryText: {
    fontWeight: '600'
  },
  dangerButton: {
    borderColor: '#fee4e2'
  },
  dangerText: {
    color: '#b42318'
  },
  languageRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap'
  },
  languageChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d0d5dd'
  },
  languageChipActive: {
    backgroundColor: '#eef4ff',
    borderColor: '#1d4ed8'
  },
  languageChipText: {
    fontWeight: '600'
  },
  languageChipTextActive: {
    color: '#1d4ed8'
  },
  languageLabel: {
    marginTop: 12
  }
});

export default SettingsScreen;
