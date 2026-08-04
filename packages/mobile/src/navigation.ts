export type RootStackParamList = {
  Watchlist: undefined;
  Stock: { symbol: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
