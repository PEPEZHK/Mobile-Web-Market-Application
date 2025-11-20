import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';

const PreferenceBar: React.FC = () => {
  const { language, setLanguage, availableLanguages } = useLanguage();
  const { mode, setMode, colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.muted }]}>{t('settings.language', { defaultValue: 'Language' })}</Text>
      </View>
      <View style={styles.row}>
        {availableLanguages.map((lang) => (
          <TouchableOpacity
            key={lang.value}
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: colors.surface },
              language === lang.value && { backgroundColor: colors.accent + '22', borderColor: colors.accent }
            ]}
            onPress={() => setLanguage(lang.value)}
          >
            <Text style={[styles.chipText, { color: language === lang.value ? colors.accent : colors.text }]}>
              {lang.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.muted }]}>{t('settings.theme', { defaultValue: 'Theme' })}</Text>
      </View>
      <View style={styles.row}>
        {(['light', 'dark', 'system'] as const).map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: colors.surface },
              mode === option && { backgroundColor: colors.accent + '22', borderColor: colors.accent }
            ]}
            onPress={() => setMode(option)}
          >
            <Text style={[styles.chipText, { color: mode === option ? colors.accent : colors.text }]}>
              {t(`theme.${option}`, { defaultValue: option })}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  column: {
    gap: 6
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1
  },
  chipText: {
    fontWeight: '600'
  }
});

export default PreferenceBar;
