import { Pressable } from 'react-native';
import { DarkTheme, NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { PortfolioScreen } from './src/screens/PortfolioScreen';
import { ListsScreen } from './src/screens/ListsScreen';
import { StockScreen } from './src/screens/StockScreen';
import { TradeScreen } from './src/screens/TradeScreen';
import { ChainScreen } from './src/screens/ChainScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  ChainIcon,
  ListsIcon,
  PortfolioIcon,
  SettingsIcon,
  TradeIcon,
} from './src/components/TabIcons';
import { colors } from './src/ui/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Mobile networks drop in and out; refetching on reconnect matters more
      // here than on desktop.
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.void,
    card: colors.abyss,
    text: colors.textPrimary,
    border: colors.borderSubtle,
    primary: colors.accent,
  },
};

function Tabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Tab.Navigator
      screenOptions={{
        // On every tab rather than one: settings that decide whether orders can
        // be placed at all shouldn't be reachable from only one screen.
        headerRight: () => (
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            hitSlop={12}
            style={{ paddingHorizontal: 4 }}
            accessibilityLabel="Settings"
            accessibilityRole="button"
          >
            <SettingsIcon color={colors.textSecondary} />
          </Pressable>
        ),
        headerStyle: { backgroundColor: colors.void },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.abyss,
          borderTopColor: colors.borderSubtle,
        },
        tabBarActiveTintColor: colors.accentBright,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Portfolio"
        component={PortfolioScreen}
        options={{
          tabBarIcon: ({ color, size }) => <PortfolioIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Lists"
        component={ListsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <ListsIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Chain"
        component={ChainScreen}
        options={{
          tabBarIcon: ({ color, size }) => <ChainIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Trade"
        component={TradeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <TradeIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: colors.void },
              headerShadowVisible: false,
              headerTintColor: colors.textPrimary,
              headerTitleStyle: { fontSize: 16 },
              contentStyle: { backgroundColor: colors.void },
            }}
          >
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen
              name="Stock"
              component={StockScreen}
              options={({ route }) => ({ title: route.params.symbol })}
            />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
