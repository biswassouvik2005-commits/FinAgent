import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export interface CategoryItem {
  category: string;
  amount: number;
}

interface PieChartProps {
  data: CategoryItem[];
  isDark: boolean;
  colors?: string[];
}

const defaultColors = ['#1DA1F2', '#17BF63', '#F45D22', '#794BC4', '#F59E0B', '#E1E8ED'];
const size = 130;
const center = size / 2;
const radius = 54;

const makeSlicePath = (start: number, end: number) => {
  const point = (angle: number) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return { x: center + radius * Math.cos(radians), y: center + radius * Math.sin(radians) };
  };
  if (end - start >= 359.99) {
    return `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center} ${center + radius} A ${radius} ${radius} 0 1 1 ${center} ${center - radius}`;
  }
  const startPoint = point(start);
  const endPoint = point(end);
  return `M ${center} ${center} L ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${endPoint.x} ${endPoint.y} Z`;
};

export const PieChart: React.FC<PieChartProps> = ({ data, isDark, colors = defaultColors }) => {
  const validData = data.filter(item => Number.isFinite(item.amount) && item.amount > 0);
  const total = validData.reduce((sum, item) => sum + item.amount, 0);
  if (!validData.length || !total || colors.length === 0) return null;

  let angle = 0;
  const slices = validData.map((item, index) => {
    const nextAngle = angle + item.amount / total * 360;
    const slice = {
      ...item,
      color: colors[index % colors.length],
      percentage: Math.round(item.amount / total * 100),
      path: makeSlicePath(angle, nextAngle),
    };
    angle = nextAngle;
    return slice;
  });

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((slice, index) => (
          <Path key={`${slice.category}-${index}`} d={slice.path} fill={slice.color} stroke={isDark ? '#111116' : '#ffffff'} strokeWidth={2} />
        ))}
      </Svg>
      <View style={styles.legend}>
        {slices.map(slice => (
          <View key={slice.category} style={styles.legendRow}>
            <View style={styles.categoryName}>
              <View style={[styles.dot, { backgroundColor: slice.color }]} />
              <Text numberOfLines={1} style={[styles.category, { color: isDark ? '#d4d4d8' : '#3f3f46' }]}>{slice.category}</Text>
            </View>
            <Text style={[styles.amount, { color: isDark ? '#f4f4f5' : '#18181b' }]}>{slice.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</Text>
            <Text style={[styles.percentage, { color: isDark ? '#a1a1aa' : '#71717a' }]}>{slice.percentage}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  legend: { flex: 1, gap: 9 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryName: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  category: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
  amount: { fontSize: 11, fontWeight: '700' },
  percentage: { width: 29, textAlign: 'right', fontSize: 10 },
});
