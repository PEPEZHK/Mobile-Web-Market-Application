import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { DatabaseProvider } from './src/providers/DatabaseProvider';
import { AuthProvider } from './src/providers/AuthProvider';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { ThemeProvider, useThemeContext } from './src/contexts/ThemeContext';

const ThemedNav: React.FC = () => {
  const { isDark } = useThemeContext();
  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
      <RootNavigator />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationContainer>
  );
};

export default function App() {

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <DatabaseProvider>
            <AuthProvider>
              <ThemedNav />
            </AuthProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
