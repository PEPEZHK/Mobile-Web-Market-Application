import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';

const LoginScreen = () => {
  const { login, register } = useAuth();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      if (mode === 'login') {
        await login(nickname, password);
      } else {
        await register(nickname, password);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      Alert.alert('Authentication error', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Offline Stock</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? 'Sign in to your offline workspace' : 'Create a local owner account'}
        </Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username"
          style={styles.input}
          value={nickname}
          onChangeText={setNickname}
        />
        <TextInput
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          disabled={submitting}
          onPress={handleSubmit}
        >
          <Text style={styles.buttonText}>{mode === 'login' ? 'Sign in' : 'Register'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode((prev) => (prev === 'login' ? 'register' : 'login'))}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            {mode === 'login' ? "Need an account? Create one" : 'Already registered? Sign in'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.helper}>
          Default admin account: admin / admin123
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    color: '#475467',
    marginBottom: 20
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12
  },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 14,
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
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center'
  },
  linkText: {
    color: '#2563eb'
  },
  helper: {
    marginTop: 16,
    fontSize: 13,
    color: '#475467',
    textAlign: 'center'
  }
});

export default LoginScreen;
