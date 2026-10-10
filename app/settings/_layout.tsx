import { Tabs, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';
import { colors, fonts, interaction, radius, spacing, typography } from '../../src/ui/tokens';

export default function SettingsLayout() {
  const [backFocused, setBackFocused] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const rootNavigation = useNavigation('/');
  const { profile } = useActiveEndpoint();
  const usageSupported = profile !== null && profile.compat.usagePath !== null;
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: 'Settings',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.heading, fontSize: typography.componentTitle },
        headerShadowVisible: false,
        headerLeft: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Close Settings"
            onPress={() => { if (rootNavigation.canGoBack()) rootNavigation.goBack(); else router.replace('/chat'); }}
            onFocus={() => setBackFocused(true)} onBlur={() => setBackFocused(false)}
            style={({ pressed }) => ({ width: interaction.touchTarget, height: interaction.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: backFocused ? 2 : 0, borderColor: colors.primary, opacity: pressed ? interaction.pressedOpacity : 1 })}>
            <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back' }} size={22} tintColor={colors.text} />
          </Pressable>
        ),
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          height: interaction.touchTarget + spacing.small + insets.bottom,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.headingMedium,
          fontSize: typography.label,
          marginBottom: 0,
        },
        tabBarItemStyle: { minHeight: interaction.touchTarget, paddingVertical: spacing.hairline },
        tabBarIconStyle: { marginTop: 0 },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'General',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'slider.horizontal.3',
                android: 'tune',
              }}
              size={22}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="models"
        options={{
          title: 'Models',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{
                ios: focused ? 'square.grid.2x2.fill' : 'square.grid.2x2',
                android: 'grid_view',
              }}
              size={22}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="endpoints"
        options={{
          title: 'Endpoints',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'server.rack', android: 'dns' }}
              size={22}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="usage"
        options={{
          title: 'Usage',
          href: usageSupported ? '/settings/usage' : null,
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'chart.bar', android: 'monitoring' }}
              size={22}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="model" options={{ href: null }} />
      <Tabs.Screen name="models-json" options={{ href: null }} />
    </Tabs>
  );
}
