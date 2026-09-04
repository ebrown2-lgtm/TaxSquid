import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: expo-symbols and expo-router/unstable-native-tabs are iOS-only
// packages. They have no Android build and throw "module not found" when
// imported statically on Android. All require() calls for those packages are
// gated inside if (Platform.OS === 'ios') blocks so Metro's dead-code
// elimination strips them entirely from the Android and web bundles.
// ─────────────────────────────────────────────────────────────────────────────

// ── Classic tab layout — Android, web, and iOS fallback ──────────────────────
function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <Feather name="bar-chart-2" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mileage"
        options={{
          title: 'Mileage',
          tabBarIcon: ({ color }) => (
            <Feather name="navigation" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Ledger',
          tabBarIcon: ({ color }) => (
            <Feather name="book" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color }) => (
            <Feather name="package" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="taxhub"
        options={{
          title: 'Tax Hub',
          tabBarIcon: ({ color }) => (
            <Feather name="file-text" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// ── Root tab layout ───────────────────────────────────────────────────────────
export default function TabLayout() {
  // Only attempt to use liquid-glass / NativeTabs on iOS.
  // The require() calls are inside this block so Metro strips them from
  // Android and web bundles — never let them reach a non-iOS build.
  if (Platform.OS === 'ios') {
    const { isLiquidGlassAvailable } = require('expo-glass-effect') as {
      isLiquidGlassAvailable: () => boolean;
    };

    if (isLiquidGlassAvailable()) {
      const { NativeTabs, Icon, Label } = require(
        'expo-router/unstable-native-tabs'
      ) as typeof import('expo-router/unstable-native-tabs');

      return (
        <NativeTabs>
          <NativeTabs.Trigger name="index">
            <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
            <Label>Dashboard</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="mileage">
            <Icon sf={{ default: 'car', selected: 'car.fill' }} />
            <Label>Mileage</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="ledger">
            <Icon
              sf={{
                default: 'list.bullet.rectangle',
                selected: 'list.bullet.rectangle.fill',
              }}
            />
            <Label>Ledger</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="inventory">
            <Icon sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }} />
            <Label>Inventory</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="taxhub">
            <Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} />
            <Label>Tax Hub</Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      );
    }
  }

  return <ClassicTabLayout />;
}
