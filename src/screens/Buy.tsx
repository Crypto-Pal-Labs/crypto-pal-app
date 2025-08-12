import React from 'react';
import { View, Dimensions } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { WebView } from 'react-native-webview'; // Already in deps from v0.4.0
import { TRANSAK_API_KEY } from '@env';
import { getWalletAddress } from '../utils/wallet'; // From v0.4.0

const initialLayout = { width: Dimensions.get('window').width };

const BuyRoute = () => (
  <WebView
    source={{ uri: `https://global-stg.transak.com?apiKey=${TRANSAK_API_KEY}&defaultCryptoCurrency=USDC&defaultFiatCurrency=NZD&walletAddress=${getWalletAddress()}` }}
    style={{ flex: 1 }}
  />
);

const SellRoute = () => (
  <WebView
    source={{ uri: `https://global-stg.transak.com?apiKey=${TRANSAK_API_KEY}&defaultCryptoCurrency=USDC&defaultFiatCurrency=NZD&walletAddress=${getWalletAddress()}&isSell=true` }}
    style={{ flex: 1 }}
  />
);

const SwapRoute = () => (
  <WebView
    source={{ uri: 'https://app.uniswap.org/swap' }}
    style={{ flex: 1 }}
  />
);

const renderScene = SceneMap({
  buy: BuyRoute,
  sell: SellRoute,
  swap: SwapRoute,
});

export default function Buy() {
  const [index, setIndex] = React.useState(0);
  const [routes] = React.useState([
    { key: 'buy', title: 'Buy' },
    { key: 'sell', title: 'Sell' },
    { key: 'swap', title: 'Swap' },
  ]);

  return (
    <TabView
      navigationState={{ index, routes }}
      renderScene={renderScene}
      onIndexChange={setIndex}
      initialLayout={initialLayout}
      renderTabBar={props => <TabBar {...props} style={{ backgroundColor: '#fff' }} />}
    />
  );
};