import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

const colors = {
  background: '#060e20',
  border: '#334155',
  muted: '#bbcabf',
  primary: '#10b981',
} as const;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontFamily: 'JetBrainsMono_500Medium',
          fontSize: 10,
          letterSpacing: 0.4,
          marginBottom: 4,
        },
        tabBarItemStyle: { minHeight: 44, paddingVertical: 2 },
        tabBarIconStyle: { marginTop: 4 },
        sceneStyle: { backgroundColor: '#0b1326' },
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
