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
/**
 * LETF is a stack route rather than a sixth tab.
 *
 * Five tabs is already the comfortable limit, and the screen only means
 * anything for the ~38 tickers in the registry — a permanent tab for a
 * question most symbols can't ask would be a poor trade. It's reached from a
 * leveraged ticker's Stock screen, where the question actually comes up, and
 * carries its own symbol input for arriving cold.
 */
export type RootStackParamList = {
  Settings: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  Stock: { symbol: string };
  Letf: { symbol?: string } | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
