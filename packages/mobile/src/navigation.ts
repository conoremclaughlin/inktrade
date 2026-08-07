import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Portfolio: undefined;
  Lists: undefined;
  Calc: { symbol?: string } | undefined;
  Trade: { symbol?: string } | undefined;
  Chain: { symbol?: string } | undefined;
};

/**
 * Trade and Chain are TABS, not stack routes.
 *
 * They were listed here too, which type-checked and then failed at runtime
 * with "The action 'NAVIGATE' with payload ... was not handled" — a stack
 * screen cannot reach a tab route by bare name. Reaching them goes through the
 * Tabs navigator: navigate('Tabs', { screen: 'Chain', params: { symbol } }).
 */
export type RootStackParamList = {
  Settings: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  Stock: { symbol: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
