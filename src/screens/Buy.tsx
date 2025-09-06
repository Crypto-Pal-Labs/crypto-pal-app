import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { getWalletAddress } from '../utils/wallet';
import { TRANSAK_API_KEY } from '@env';
import { useFocusEffect } from '@react-navigation/native';  // For reload on focus

const BuyRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      getWalletAddress().then((addr) => {
        setAddress(addr);
        const newUri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${addr}&defaultFiatCurrency=NZD&defaultFiatAmount=10&defaultCryptoCurrency=USDC&defaultPaymentMethod=credit_card&productsAvailed=BUY&defaultProduct=BUY&isBuyOrSell=BUY&environment=STAGING&network=sepolia&disableWalletAddressForm=true`;
        setUri(newUri);
        console.log('Buy URI reloaded:', newUri);
        setLoading(false);
      });
    }, [])
  );

  if (loading) return <ActivityIndicator />;
  return <WebView source={{ uri }} style={{ flex: 1 }} cacheMode="LOAD_NO_CACHE" key="buy" />;
};

const SellRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      getWalletAddress().then((addr) => {
        setAddress(addr);
        const newUri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&cryptoCurrency=USDC&cryptoAmount=1&fiatCurrency=NZD&paymentMethod=bank_transfer&productsAvailed=SELL&defaultProduct=SELL&isBuyOrSell=SELL&environment=STAGING&network=sepolia&disableWalletAddressForm=true`;
        setUri(newUri);
        console.log('Sell URI reloaded:', newUri);
        setLoading(false);
      });
    }, [])
  );

  if (loading) return <ActivityIndicator />;
  return <WebView source={{ uri }} style={{ flex: 1 }} cacheMode="LOAD_NO_CACHE" key="sell" />;
};

const Buy = () => {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'buy', title: 'Buy' },
    { key: 'sell', title: 'Sell' },
  ]);

  const renderScene = SceneMap({
    buy: BuyRoute,
    sell: SellRoute,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trading</Text>
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
        renderTabBar={(props) => (
          <TabBar {...props} style={styles.tabBar} activeColor="#0A84FF" inactiveColor="#ccc" indicatorStyle={styles.indicator} />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' }, // Light gray background
  heading: { fontSize: 34, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', padding: 12, marginTop: 26 }, // Blue, centered, moved down 1 line
  tabBar: { backgroundColor: '#fff' },
  indicator: { backgroundColor: '#0A84FF' }, // Blue line for active tab
});

export default Buy;