import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabTwoScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: isDark ? '#171717' : '#ffffff' }]}
      contentContainerStyle={{ 
        paddingTop: insets.top + 40, 
        paddingBottom: insets.bottom, 
        paddingHorizontal: 24 
      }}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: isDark ? '#ffffff' : '#000000' }]}>
          Analytics
        </Text>
        <Text style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#52525b' }]}>
          Your financial insights and agent reports will appear here.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1 
  },
  header: { 
    marginBottom: 30 
  },
  title: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    marginBottom: 8 
  },
  subtitle: { 
    fontSize: 16,
    lineHeight: 24,
  },
});