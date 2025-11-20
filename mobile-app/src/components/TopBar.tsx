import { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';

type MenuType = 'language' | 'theme' | null;

const TopBar: React.FC = () => {
  const { language, setLanguage, availableLanguages } = useLanguage();
  const { mode, setMode, colors } = useTheme();
  const { t } = useTranslation();
  const [openMenu, setOpenMenu] = useState<MenuType>(null);

  const closeMenu = () => setOpenMenu(null);

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
        >
          <Text style={[styles.pillText, { color: colors.text }]}>{t('settings.language', { defaultValue: 'Language' })} · {availableLanguages.find((l) => l.value === language)?.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
        >
          <Text style={[styles.pillText, { color: colors.text }]}>{t('settings.theme', { defaultValue: 'Theme' })} · {t(`theme.${mode}`, { defaultValue: mode })}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={openMenu !== null} transparent animationType="fade" onRequestClose={closeMenu}>
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {openMenu === 'language' &&
                  availableLanguages.map((lang) => (
                    <TouchableOpacity
                      key={lang.value}
                      style={[
                        styles.menuItem,
                        { borderColor: colors.border },
                        language === lang.value && { backgroundColor: colors.accent + '22', borderColor: colors.accent }
                      ]}
                      onPress={() => {
                        setLanguage(lang.value);
                        closeMenu();
                      }}
                    >
                      <Text style={{ color: language === lang.value ? colors.accent : colors.text }}>{lang.label}</Text>
                    </TouchableOpacity>
                  ))}
                {openMenu === 'theme' &&
                  (['light', 'dark', 'system'] as const).map((themeOption) => (
                    <TouchableOpacity
                      key={themeOption}
                      style={[
                        styles.menuItem,
                        { borderColor: colors.border },
                        mode === themeOption && { backgroundColor: colors.accent + '22', borderColor: colors.accent }
                      ]}
                      onPress={() => {
                        setMode(themeOption);
                        closeMenu();
                      }}
                    >
                      <Text style={{ color: mode === themeOption ? colors.accent : colors.text }}>
                        {t(`theme.${themeOption}`, { defaultValue: themeOption })}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    marginBottom: 12
  },
  row: {
    flexDirection: 'row',
    gap: 8
  },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  pillText: {
    fontWeight: '600'
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24
  },
  menu: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    gap: 6
  },
  menuItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10
  }
});

export default TopBar;
