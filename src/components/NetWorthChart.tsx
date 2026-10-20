import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

interface NetWorthChartProps {
  currentValue: number;
  isDark: boolean;
}

export function NetWorthChart({ currentValue, isDark }: NetWorthChartProps) {
  const { t } = useTranslation();
  const textColor = isDark ? '#F8F9FC' : '#101828';
  const mutedColor = isDark ? '#C0C6D6' : '#475569';

  return (
    <View style={styles.container}>
      <Text style={[styles.value, { color: textColor }]}>
        {currentValue.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        })}
      </Text>
      <Text style={[styles.caption, { color: mutedColor }]}>
        {t('Historical trend is unavailable until dated balance history is recorded.')}
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
