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
  // NativeTabs (Liquid Glass) is currently disabled — expo-router's
  // unstable-native-tabs has an open upstream bug where SF Symbol icons
  // render blank on dev-client builds (github.com/expo/expo/issues/41048).
  // Using the stable Feather-icon tab bar until that's resolved.
  return <ClassicTabLayout />;
}
