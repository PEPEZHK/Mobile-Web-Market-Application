import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, subtitle }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <View>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    marginBottom: 8,
    borderBottomWidth: 1
  },
  title: {
    fontSize: 22,
    fontWeight: '800'
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13
  }
});

export default ScreenHeader;
