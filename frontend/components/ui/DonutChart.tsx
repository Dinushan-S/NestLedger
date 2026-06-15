import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { theme } from '../../constants/nestledger';

export type DonutSlice = {
  key: string;
  value: number;
  color: string;
};

type Props = {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
  activeKey?: string | null;
  onSlicePress?: (key: string) => void;
  testID?: string;
};

/**
 * Lightweight donut chart built on react-native-svg (no chart library).
 * Each slice is an arc drawn via stroke-dasharray on a circle, rotated into place.
 * Works on iOS, Android, and web (react-native-web).
 */
export default function DonutChart({
  slices,
  size = 220,
  strokeWidth = 26,
  centerLabel,
  centerSubLabel,
  activeKey,
  onSlicePress,
  testID,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const positive = useMemo(() => slices.filter((s) => s.value > 0), [slices]);
  const total = useMemo(() => positive.reduce((acc, s) => acc + s.value, 0), [positive]);

  // Pre-compute the cumulative offset (in fraction of the circle) for each slice.
  const arcs = useMemo(() => {
    let cumulative = 0;
    return positive.map((s) => {
      const fraction = total > 0 ? s.value / total : 0;
      const arc = { ...s, fraction, startFraction: cumulative };
      cumulative += fraction;
      return arc;
    });
  }, [positive, total]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]} testID={testID}>
      <Svg width={size} height={size}>
        {/* track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* rotate so arcs start at 12 o'clock */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          {arcs.map((a) => {
            const dash = a.fraction * circumference;
            const gap = circumference - dash;
            const offset = -a.startFraction * circumference;
            const dimmed = activeKey != null && activeKey !== a.key;
            return (
              <Circle
                key={a.key}
                cx={center}
                cy={center}
                r={radius}
                stroke={a.color}
                strokeWidth={activeKey === a.key ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                fill="none"
                opacity={dimmed ? 0.35 : 1}
                onPress={onSlicePress ? () => onSlicePress(a.key) : undefined}
              />
            );
          })}
        </G>
      </Svg>

      <Pressable
        style={styles.center}
        pointerEvents={onSlicePress ? 'auto' : 'none'}
        onPress={onSlicePress && activeKey ? () => onSlicePress(activeKey) : undefined}
      >
        {!!centerLabel && (
          <Text style={styles.centerLabel} numberOfLines={1}>
            {centerLabel}
          </Text>
        )}
        {!!centerSubLabel && (
          <Text style={styles.centerSub} numberOfLines={1}>
            {centerSubLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '700',
  },
  centerSub: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
