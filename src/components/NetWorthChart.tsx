import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

interface DataPoint {
  date: string;
  value: number;
}

interface NetWorthChartProps {
  currentValue: number;
  isDark: boolean;
}

const periods = ['1W', '1M', '3M', '1Y'] as const;
type Period = typeof periods[number];

const getPeriodData = (period: Period, value: number): DataPoint[] => {
  switch (period) {
    case '1W':
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'].map(date => ({ date, value }));
    case '1M':
      return ['W1', 'W2', 'W3', 'W4', 'Today'].map(date => ({ date, value }));
    case '3M':
      return ['M1', 'M2', 'M3', 'Today'].map(date => ({ date, value }));
    case '1Y':
      return ['Q1', 'Q2', 'Q3', 'Q4', 'Now'].map(date => ({ date, value }));
  }
};

export const NetWorthChart: React.FC<NetWorthChartProps> = ({ currentValue, isDark }) => {
  const [period, setPeriod] = useState<Period>('1M');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const data = useMemo(() => getPeriodData(period, currentValue), [period, currentValue]);
  const low = Math.min(...data.map(point => point.value));
  const high = Math.max(...data.map(point => point.value));
  const paddingX = 16;
  const paddingY = 15;
  const width = 320;
  const height = 132;
  const range = high - low || 1;
  const x = (index: number) => paddingX + (index / Math.max(1, data.length - 1)) * (width - paddingX * 2);
  const y = (value: number) => height - paddingY - ((value - low) / range) * (height - paddingY * 2);
  const points = data.map((point, index) => `${x(index)},${y(point.value)}`);
  const linePath = `M ${points.join(' L ')}`;
  const fillPath = `M ${x(0)},${height} L ${points.join(' L ')} L ${x(data.length - 1)},${height} Z`;
  const selectedIndex = activeIndex ?? data.length - 1;
  const activePoint = data[selectedIndex];
  const change = activePoint.value - data[0].value;
  const percent = data[0].value === 0 ? 0 : change / Math.abs(data[0].value) * 100;
  const textColor = isDark ? '#f4f4f5' : '#18181b';
  const mutedColor = isDark ? '#a1a1aa' : '#71717a';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.value, { color: textColor }]}>
            {activePoint.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </Text>
          <Text style={[styles.change, { color: change >= 0 ? '#10b981' : '#f43f5e' }]}>
            {change >= 0 ? '+' : '-'}{Math.abs(change).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} ({percent >= 0 ? '+' : ''}{percent.toFixed(1)}%)
          </Text>
        </View>
        <View style={styles.periods}>
          {periods.map(item => {
            const active = item === period;
            return (
              <Pressable
                key={item}
                onPress={() => {
                  setPeriod(item);
                  setActiveIndex(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.periodButton, { backgroundColor: active ? '#7c3aed' : 'transparent' }]}
              >
                <Text style={[styles.periodText, { color: active ? '#fff' : mutedColor }]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Svg width="100%" height={144} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#8b5cf6" stopOpacity={isDark ? 0.32 : 0.22} />
            <Stop offset="1" stopColor="#8b5cf6" stopOpacity={0.01} />
          </LinearGradient>
        </Defs>
        <Path d={fillPath} fill="url(#netWorthGradient)" />
        <Path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((point, index) => (
          <React.Fragment key={point.date}>
            {index === selectedIndex ? (
              <Line x1={x(index)} y1={0} x2={x(index)} y2={height} stroke={isDark ? '#52525b' : '#d4d4d8'} strokeDasharray="4 5" />
            ) : null}
            <Circle
              cx={x(index)}
              cy={y(point.value)}
              r={index === selectedIndex ? 5 : 3}
              fill="#8b5cf6"
              stroke={isDark ? '#111116' : '#ffffff'}
              strokeWidth={2}
              onPress={() => setActiveIndex(index)}
            />
          </React.Fragment>
        ))}
      </Svg>
      <View style={styles.labels}>
        {data.map((point, index) => (
          <Pressable key={`${point.date}-${index}`} onPress={() => setActiveIndex(index)}>
            <Text style={[styles.label, { color: mutedColor }]}>{point.date}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  value: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  change: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  periods: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#8b5cf615' },
  periodButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
  periodText: { fontSize: 10, fontWeight: '800' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  label: { fontSize: 9, fontWeight: '600' },
});
