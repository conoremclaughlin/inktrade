export type TabParamList = {
  Portfolio: undefined;
  Lists: undefined;
  Trade: { symbol?: string } | undefined;
  Chain: { symbol?: string } | undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Stock: { symbol: string };
  Trade: { symbol?: string } | undefined;
  Chain: { symbol?: string } | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
