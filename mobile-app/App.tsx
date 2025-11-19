import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { DatabaseProvider } from './src/providers/DatabaseProvider';
import { AuthProvider } from './src/providers/AuthProvider';

export default function App() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <AuthProvider>
          <NavigationContainer theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootNavigator />
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          </NavigationContainer>
        </AuthProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
