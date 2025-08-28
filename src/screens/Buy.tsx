import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Button } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { getWalletAddress } from '../utils/wallet';
import { TRANSAK_API_KEY } from '@env';
import { useNavigation } from '@react-navigation/native';

const BuyRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getWalletAddress().then((addr) => {
      setAddress(addr);
      setLoading(false);
    });
  }, []);
  const uri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${address}&defaultFiatCurrency=NZD&defaultFiatAmount=10&defaultCryptoCurrency=USDC&defaultPaymentMethod=credit_card&productsAvailed=BUY&product=BUY&hideExchangeScreen=true&isTestingMode=true&environment=STAGING&network=ethereum`;
  console.log('Buy URI:', uri);
  if (loading) return <ActivityIndicator />;
  return <WebView source={{ uri }} style={{ flex: 1 }} />;
};

const SellRoute = () => {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Omit getWalletAddress for Sell in staging to avoid testnet conflict; rely on disableWalletAddressCheck
    setLoading(false);
  }, []);
  const uri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&cryptoCurrency=USDC&cryptoAmount=1&fiatCurrency=NZD&paymentMethod=bank_transfer&productsAvailed=SELL&product=SELL&disableWalletAddressCheck=true&isTestingMode=true&environment=STAGING&network=ethereum`;
  console.log('Sell URI:', uri);
  if (loading) return <ActivityIndicator />;
  return <WebView source={{ uri }} style={{ flex: 1 }} />;
};

const Buy = () => {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'buy', title: 'Buy' },
    { key: 'sell', title: 'Sell' },
    // { key: 'swap', title: 'Swap' } // Deferred - hidden for MVP stability
  ]);

  const renderScene = SceneMap({
    buy: BuyRoute,
    sell: SellRoute,
    // swap: SwapRoute, // Deferred - hidden for MVP stability
  });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trade</Text>
      <TabView
        navigationState={ { index, routes } }
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
        renderTabBar={(props) => (
          <TabBar {...props} style={styles.tabBar} activeColor="#007AFF" inactiveColor="#ccc" indicatorStyle={styles.indicator} />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  heading: { fontSize: 24, fontWeight: 'bold', color: '#007AFF', padding: 16, textAlign: 'center' },
  tabBar: { backgroundColor: '#fff' },
  indicator: { backgroundColor: '#007AFF' }, // Blue line for active tab
});

export default Buy;