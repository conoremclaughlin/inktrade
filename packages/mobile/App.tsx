import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList } from './src/navigation';
import { WatchlistScreen } from './src/screens/WatchlistScreen';
import { StockScreen } from './src/screens/StockScreen';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: colors.abyss },
              headerTintColor: colors.textPrimary,
              headerTitleStyle: { fontSize: 16 },
              contentStyle: { backgroundColor: colors.void },
            }}
          >
            <Stack.Screen
              name="Watchlist"
              component={WatchlistScreen}
              options={{ title: 'Inktrade' }}
            />
            <Stack.Screen
              name="Stock"
              component={StockScreen}
              options={({ route }) => ({ title: route.params.symbol })}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
