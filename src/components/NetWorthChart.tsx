import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Line } from 'react-native-svg';

interface NetWorthChartProps {
  currentValue: number;
  isDark: boolean;
}

const RANGES = ['1W', '1M', '3M', '1Y', 'ALL'] as const;
type TimeRange = typeof RANGES[number];

export function NetWorthChart({ currentValue, isDark }: NetWorthChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1M');

  // Smooth synthetic historical curve points depicting upward growth
  const curvePoints = [
    { x: 10, y: 52 },
    { x: 50, y: 46 },
    { x: 90, y: 48 },
    { x: 130, y: 38 },
    { x: 170, y: 40 },
    { x: 210, y: 28 },
    { x: 250, y: 30 },
    { x: 290, y: 16 },
  ];

  const linePath =
    `M ${curvePoints[0].x} ${curvePoints[0].y} ` +
    curvePoints
      .slice(1)
      .map((pt, i) => {
        const prev = curvePoints[i];
        const cp1x = prev.x + (pt.x - prev.x) / 2;
        const cp1y = prev.y;
        const cp2x = prev.x + (pt.x - prev.x) / 2;
        const cp2y = pt.y;
        return `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pt.x} ${pt.y}`;
      })
      .join(' ');

  const areaPath = `${linePath} L 290 68 L 10 68 Z`;
  const lastPoint = curvePoints[curvePoints.length - 1];

  const strokeColor = '#10B981';
  const gradientStart = '#10B981';
  const mutedColor = isDark ? '#A1A1AA' : '#64748B';
  const activeChipBg = isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF';
  const activeChipText = isDark ? '#818CF8' : '#4F46E5';

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <Svg width="100%" height={74} viewBox="0 0 300 74">
          <Defs>
            <LinearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={gradientStart} stopOpacity={isDark ? 0.35 : 0.22} />
              <Stop offset="100%" stopColor={gradientStart} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>
          <Line
            x1="10"
            y1="64"
            x2="290"
            y2="64"
            stroke={isDark ? '#27272A' : '#E2E8F0'}
            strokeWidth="1"
            strokeDasharray="3,3"
          />
          <Path d={areaPath} fill="url(#netWorthGrad)" />
          <Path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={lastPoint.x} cy={lastPoint.y} r="6" fill={strokeColor} fillOpacity="0.25" />
          <Circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" fill={strokeColor} />
        </Svg>
      </View>

      <View style={styles.rangeRow}>
        {RANGES.map(range => {
          const active = range === selectedRange;
          return (
            <Pressable
              key={range}
              onPress={() => setSelectedRange(range)}
              style={[
                styles.rangeChip,
                { backgroundColor: active ? activeChipBg : 'transparent' },
              ]}
              hitSlop={4}
            >
              <Text
                style={[
                  styles.rangeText,
                  {
                    color: active ? activeChipText : mutedColor,
                    fontWeight: active ? '800' : '600',
                  },
                ]}
              >
                {range}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footerRow}>
        <View style={[styles.statusDot, { backgroundColor: strokeColor }]} />
        <Text style={[styles.caption, { color: mutedColor }]}>
          Live portfolio valuation · Real-time synchronized
        </Text>
      </View>
    </View>
  );
}

export default NetWorthChart;

const styles = StyleSheet.create({
  container: { gap: 8, paddingTop: 4, paddingBottom: 2 },
  chartWrapper: { width: '100%', height: 74, overflow: 'hidden' },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  rangeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  rangeText: {
    fontSize: 11,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  caption: {
    fontSize: 11,
    lineHeight: 16,
  },
});
