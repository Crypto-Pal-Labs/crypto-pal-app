import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { getWalletAddress } from '../utils/wallet';
import { TRANSAK_API_KEY } from '@env';

const BuyRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getWalletAddress().then((addr) => {
      setAddress(addr);
      setLoading(false);
    });
  }, []);
  const uri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${address}&defaultFiatCurrency=NZD&defaultFiatAmount=10&defaultCryptoCurrency=USDC&defaultPaymentMethod=credit_card&productsAvailed=BUY&isTestingMode=true&environment=STAGING`;
  console.log('Buy URI:', uri);
  if (loading) return <ActivityIndicator />;
  return <WebView source={{ uri }} style={{ flex: 1 }} />;
};

const SellRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getWalletAddress().then((addr) => {
      setAddress(addr);
      setLoading(false);
    });
  }, []);
  const uri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${address}&defaultCryptoCurrency=USDC&defaultCryptoAmount=1&defaultFiatCurrency=NZD&defaultPaymentMethod=bank_transfer&productsAvailed=SELL&disableWalletAddressCheck=true&isTestingMode=true&environment=STAGING`;
  console.log('Sell URI:', uri);
  if (loading) return <ActivityIndicator />;
  return <WebView source={{ uri }} style={{ flex: 1 }} />;
};

const SwapRoute = () => {
  const uri = 'https://app.uniswap.org/#/swap';
  console.log('Swap URI:', uri);
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