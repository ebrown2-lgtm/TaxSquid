import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface MetricCardProps {
  label: string;
  value: string;
  subLabel?: string;
  accentColor?: string;
  icon: React.ReactNode;
  fullWidth?: boolean;
}

export function MetricCard({
  label,
  value,
  subLabel,
  accentColor,
  icon,
  fullWidth = false,
}: MetricCardProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...(fullWidth ? { width: '100%' } : { flex: 1 }),
        },
      ]}
    >
      <View style={styles.topRow}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: (accentColor ?? colors.teal) + '22',
            },
          ]}
        >
          {icon}
        </View>
      </View>
      <Text
        style={[styles.value, { color: accentColor ?? colors.foreground }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      {subLabel ? (
        <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
          {subLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    minHeight: 110,
    justifyContent: 'flex-end',
    gap: 2,
  },
  topRow: {
    marginBottom: 8,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.2,
  },
  subLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
