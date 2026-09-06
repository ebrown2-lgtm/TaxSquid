import React from "react";
import { Stack } from "expo-router";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

interface SettingsRow {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sublabel: string;
}

interface SettingsSection {
  title: string;
  rows: SettingsRow[];
}

const SECTIONS: SettingsSection[] = [
  {
    title: "Tax & Financial Rules",
    rows: [
      {
        icon: "truck",
        label: "Standard Mileage Rate",
        sublabel: "IRS rate or custom override",
      },
    ],
  },
  {
    title: "Data Export & Support",
    rows: [
      {
        icon: "file-text",
        label: "Export Tax Reports",
        sublabel: "CSV/PDF formatted for Schedule C",
      },
      {
        icon: "help-circle",
        label: "Help & Feedback",
        sublabel: "Send feedback or report a bug",
      },
      {
        icon: "shield",
        label: "Legal & Privacy",
        sublabel: "Terms, Privacy Policy, App Version",
      },
    ],
  },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useApp();

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          // The root layout's auth listener redirects to /(auth)/sign-in automatically
        },
      },
    ]);
  };
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backBtn}
          activeOpacity={0.75}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Settings
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: colors.mutedForeground }]}
            >
              {section.title.toUpperCase()}
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {section.rows.map((row, i) => (
                <View key={row.label}>
                  <TouchableOpacity
                    style={styles.row}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (row.label === "Standard Mileage Rate") {
                        router.push("/settings/mileage-rate");
                      } else if (row.label === "Export Tax Reports") {
                        router.push("/(tabs)/taxhub");
                      } else if (row.label === "Help & Feedback") {
                        Linking.openURL(
                          "mailto:support@taxsquid.app?subject=TaxSquid Feedback",
                        );
                      } else if (row.label === "Legal & Privacy") {
                        Alert.alert("Legal & Privacy", undefined, [
                          {
                            text: "Privacy Policy",
                            onPress: () =>
                              Linking.openURL(
                                "https://taxsquid.app/privacy.html",
                              ),
                          },
                          {
                            text: "Terms of Service",
                            onPress: () =>
                              Linking.openURL(
                                "https://taxsquid.app/terms.html",
                              ),
                          },
                          { text: "Cancel", style: "cancel" },
                        ]);
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.rowIcon,
                        { backgroundColor: colors.teal + "18" },
                      ]}
                    >
                      <Feather name={row.icon} size={16} color={colors.teal} />
                    </View>
                    <View style={styles.rowText}>
                      <Text
                        style={[styles.rowLabel, { color: colors.foreground }]}
                      >
                        {row.label}
                      </Text>
                      <Text
                        style={[
                          styles.rowSublabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {row.sublabel}
                      </Text>
                    </View>
                    <Feather
                      name="chevron-right"
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                  {i < section.rows.length - 1 && (
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: colors.border },
                      ]}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[
            styles.signOutBtn,
            {
              backgroundColor: colors.destructive + "15",
              borderColor: colors.destructive + "40",
            },
          ]}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>
            Sign Out
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteAccountLink}
          onPress={() => router.push("/settings/delete-account")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.deleteAccountText,
              { color: colors.mutedForeground },
            ]}
          >
            Delete Account
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowSublabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 58,
  },

  deleteAccountLink: { alignItems: "center", paddingVertical: 14 },
  deleteAccountText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    marginTop: 4,
  },
  signOutText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
