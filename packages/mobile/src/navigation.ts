export type TabParamList = {
  Portfolio: undefined;
  Lists: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Stock: { symbol: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
