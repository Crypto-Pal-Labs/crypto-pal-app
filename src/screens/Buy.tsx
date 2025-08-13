import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { getWalletAddress } from '../utils/wallet';
import { TRANSAK_API_KEY } from '@env';

const BuyRoute = () => {
  const [address, setAddress] = useState('');
  useEffect(() => {
    getWalletAddress().then(setAddress);
  }, []);
  const uri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${address}&defaultFiatCurrency=NZD&defaultCryptoCurrency=USDC&productsAvailed=BUY&environment=STAGING`;
  return address ? <WebView source={{ uri }} style={{ flex: 1 }} /> : <Text>Loading...</Text>;
};

const SellRoute = () => {
  const [address, setAddress] = useState('');
  useEffect(() => {
    getWalletAddress().then(setAddress);
  }, []);
  const uri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${address}&defaultFiatCurrency=NZD&defaultCryptoCurrency=USDC&productsAvailed=SELL&environment=STAGING`;
  return address ? <WebView source={{ uri }} style={{ flex: 1 }} /> : <Text>Loading...</Text>;
};

const SwapRoute = () => {
  const uri = 'https://app.uniswap.org/#/swap'; // Stub; add wallet connect later
  return <WebView source={{ uri }} style={{ flex: 1 }} />;
};

const Buy = () => {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'buy', title: 'Buy' },
    { key: 'sell', title: 'Sell' },
    { key: 'swap', title: 'Swap' },
  ]);

  const renderScene = SceneMap({
    buy: BuyRoute,
    sell: SellRoute,
    swap: SwapRoute,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trade</Text>
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
        renderTabBar={(props) => (
          <TabBar {...props} style={styles.tabBar} activeColor="#0A84FF" inactiveColor="#ccc" />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 24, fontWeight: 'bold', padding: 16 },
  tabBar: { backgroundColor: '#fff' },
});

export default Buy;