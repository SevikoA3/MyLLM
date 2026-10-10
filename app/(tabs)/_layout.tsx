import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, interaction, spacing, typography } from '../../src/ui/tokens';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{
                ios: focused ? 'bubble.left.and.bubble.right.fill' : 'bubble.left.and.bubble.right',
                android: 'chat_bubble',
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
          title: 'Catalog',
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
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'clock.arrow.circlepath', android: 'history' }}
              size={22}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'gearshape', android: 'settings' }}
              size={22}
              tintColor={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
