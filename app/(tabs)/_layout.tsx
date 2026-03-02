import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { useSettings } from '../../contexts/SettingsContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  name: IoniconsName;
  focused: boolean;
  outlineName: IoniconsName;
}

function TabIcon({ name, focused, outlineName }: TabIconProps) {
  return (
    <View style={styles.iconWrapper}>
      <Ionicons
        name={focused ? name : outlineName}
        size={24}
        color={focused ? Colors.accent.primary : Colors.text.muted}
      />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function TabLayout() {
  const { settings } = useSettings();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.accent.primary,
        tabBarInactiveTintColor: Colors.text.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" outlineName="home-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="spese"
        options={{
          title: 'Spese',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="receipt" outlineName="receipt-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="importa"
        options={{
          title: 'Importa',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="cloud-upload"
              outlineName="cloud-upload-outline"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          href: settings.features.portfolio ? undefined : null,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="trending-up"
              outlineName="trending-up-outline"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          href: settings.features.coach ? undefined : null,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="bulb" outlineName="bulb-outline" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bg.secondary,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    height: Platform.OS === 'ios' ? 82 : 64,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  iconWrapper: {
    alignItems: 'center',
    gap: 3,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent.primary,
  },
});
