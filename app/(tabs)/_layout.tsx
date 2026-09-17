import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useTheme } from '../../src/ui/theme';

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
          tabBarIcon: ({ color, focused, size }) => (
            <SymbolView
              name={{
                ios: focused ? 'bubble.left.and.bubble.right.fill' : 'bubble.left.and.bubble.right',
                android: 'chat_bubble',
              }}
              size={size}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="models"
        options={{
          title: 'Model',
          tabBarIcon: ({ color, focused, size }) => (
            <SymbolView
              name={{
                ios: focused ? 'square.grid.2x2.fill' : 'square.grid.2x2',
                android: 'grid_view',
              }}
              size={size}
              tintColor={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
