import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface Props {
  message?: string;
}

const FullScreenLoader: React.FC<Props> = ({ message = 'Preparing offline database…' }) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center'
  }
});

export default FullScreenLoader;
