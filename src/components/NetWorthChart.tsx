import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface NetWorthChartProps {
  currentValue: number;
  isDark: boolean;
}

export function NetWorthChart({ currentValue, isDark }: NetWorthChartProps) {
  const textColor = isDark ? '#FAFAFA' : '#0F172A';
  const mutedColor = isDark ? '#A1A1AA' : '#64748B';

  return (
    <View style={styles.container}>
      <Text style={[styles.value, { color: textColor }]}>
        {currentValue.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        })}
      </Text>
      <Text style={[styles.caption, { color: mutedColor }]}>
        Historical trend is unavailable until dated balance history is recorded.
      </Text>
    </View>
  );
}

export default NetWorthChart;

const styles = StyleSheet.create({
  container: { gap: 4, paddingVertical: 8 },
  value: { fontSize: 22, fontWeight: '800' },
  caption: { fontSize: 11, lineHeight: 16 },
});
