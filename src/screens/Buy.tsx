import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { getWalletAddress } from '../utils/wallet';
import { TRANSAK_API_KEY } from '@env';
import { useFocusEffect } from '@react-navigation/native';  // For reload on focus
import * as Localization from 'expo-localization';  // For geo

const BuyRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      const region = Localization.getLocales()[0]?.regionCode || 'NZ';  // Default NZ
      const restrictedCountries = ['US', 'CA'];  // Add restricted regions (e.g., for compliance)
      const restricted = restrictedCountries.includes(region);
      setIsRestricted(restricted);

      getWalletAddress().then((addr) => {
        setAddress(addr || '');  // Handle null as empty string
        if (!restricted) {
          const defaultFiat = region === 'NZ' ? 'NZD' : 'USD';  // Locale-aware, fallback USD
          const newUri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${addr || ''}&defaultFiatCurrency=${defaultFiat}&defaultFiatAmount=10&defaultCryptoCurrency=USDC&defaultPaymentMethod=credit_card&productsAvailed=BUY&defaultProduct=BUY&isBuyOrSell=BUY&environment=STAGING&network=sepolia&disableWalletAddressForm=true`;
          setUri(newUri);
          console.log('Buy URI reloaded:', newUri);
        }
        setLoading(false);
      });
    }, [])
  );

  if (loading) return <ActivityIndicator />;
  if (isRestricted) return <Text style={styles.restrictedText}>Buy feature unavailable in your region.</Text>;
  return <WebView source={{ uri }} style={{ flex: 1 }} cacheMode="LOAD_NO_CACHE" key="buy" />;
};

const SellRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      const region = Localization.getLocales()[0]?.regionCode || 'NZ';
      const restrictedCountries = ['US', 'CA'];
      const restricted = restrictedCountries.includes(region);
      setIsRestricted(restricted);

      getWalletAddress().then((addr) => {
        setAddress(addr || '');
        if (!restricted) {
          const defaultFiat = region === 'NZ' ? 'NZD' : 'USD';
          const newUri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&cryptoCurrency=USDC&cryptoAmount=1&fiatCurrency=${defaultFiat}&paymentMethod=bank_transfer&productsAvailed=SELL&defaultProduct=SELL&isBuyOrSell=SELL&environment=STAGING&network=sepolia&disableWalletAddressForm=true`;
          setUri(newUri);
          console.log('Sell URI reloaded:', newUri);
        }
        setLoading(false);
      });
    }, [])
  );

  if (loading) return <ActivityIndicator />;
  if (isRestricted) return <Text style={styles.restrictedText}>Sell feature unavailable in your region.</Text>;
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
          <TabBar {...props} style={styles.tabBar} activeColor="#0A84FF" inactiveColor="#3d3c3cff" indicatorStyle={styles.indicator} />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  heading: { fontSize: 34, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', padding: 12, marginTop: 26 },
  tabBar: { backgroundColor: '#edfabfff', borderRadius: 8, shadowColor: '#0606fbff', shadowOpacity: 0.1, shadowRadius: 12, elevation: 4, marginBottom: 10 },
  indicator: { backgroundColor: '#0A84FF' },
  restrictedText: { flex: 1, textAlign: 'center', marginTop: 20, color: 'red', fontSize: 18 },
});

export default Buy;