import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { getWalletAddress } from '../utils/wallet';
import { TRANSAK_API_KEY } from '@env';
import { useFocusEffect } from '@react-navigation/native';  // For reload on focus
import * as Localization from 'expo-localization';  // For geo and currency
import { useAssets } from '../hooks/useAssets';  // For refresh after buy

const BuyRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const { refresh } = useAssets();  // Correct hook method for refresh

  useFocusEffect(
    useCallback(() => {
      const locale = Localization.getLocales()[0] || { regionCode: 'US', currencyCode: 'USD' };  // Default US/USD
      const region = locale.regionCode || 'US';
      const restrictedCountries = ['US', 'CA'];  // Add restricted regions
      const restricted = restrictedCountries.includes(region);
      setIsRestricted(restricted);

      getWalletAddress().then((addr) => {
        setAddress(addr || '');  // Handle null as empty string
        if (!restricted) {
          const defaultFiat = locale.currencyCode || 'USD';  // User's local or USD default
          const newUri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${addr || ''}&defaultFiatCurrency=${defaultFiat}&defaultFiatAmount=10&defaultCryptoCurrency=USDC&defaultPaymentMethod=credit_card&productsAvailed=BUY&defaultProduct=BUY&isBuyOrSell=BUY&environment=STAGING&network=sepolia&disableWalletAddressForm=true`;
          setUri(newUri);
          console.log('Buy URI reloaded:', newUri);
        }
        setLoading(false);
      });
    }, [])
  );

  // Detect buy completion in WebView (e.g., success URL)
  const handleNavigationChange = (navState: { url: string }) => {
    if (navState.url.includes('transak.com/success') || navState.url.includes('transaction/success')) {  // Adjust for staging success pattern
      refresh();  // Auto-refresh Wallet (balances update); History polls automatically
      console.log('Buy complete—refreshing assets');
    }
  };

  if (loading) return <ActivityIndicator />;
  if (isRestricted) return <Text style={styles.restrictedText}>Buy feature unavailable in your region.</Text>;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1 }}
        cacheMode="LOAD_NO_CACHE"
        key="buy"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={true}
        onError={(syntheticEvent) => console.error('WebView error:', syntheticEvent.nativeEvent)}
        useWebKit={Platform.OS === 'ios'}  // Better camera support on iOS
        onNavigationStateChange={handleNavigationChange}  // Detect success for refresh
      />
    </ScrollView>
  );
};

const SellRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const { refresh } = useAssets();  // Correct hook method for refresh (optional for Sell)

  useFocusEffect(
    useCallback(() => {
      const locale = Localization.getLocales()[0] || { regionCode: 'US', currencyCode: 'USD' };
      const region = locale.regionCode || 'US';
      const restrictedCountries = ['US', 'CA'];
      const restricted = restrictedCountries.includes(region);
      setIsRestricted(restricted);

      getWalletAddress().then((addr) => {
        setAddress(addr || '');
        if (!restricted) {
          const defaultFiat = locale.currencyCode || 'USD';
          const newUri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&cryptoCurrency=USDC&cryptoAmount=1&fiatCurrency=${defaultFiat}&paymentMethod=bank_transfer&productsAvailed=SELL&defaultProduct=SELL&isBuyOrSell=SELL&environment=STAGING&network=sepolia&disableWalletAddressForm=true`;
          setUri(newUri);
          console.log('Sell URI reloaded:', newUri);
        }
        setLoading(false);
      });
    }, [])
  );

  // Detect sell completion in WebView (optional, add if Sell needs refresh)
  const handleNavigationChange = (navState: { url: string }) => {
    if (navState.url.includes('transak.com/success') || navState.url.includes('transaction/success')) {
      refresh();
      console.log('Sell complete—refreshing assets');
    }
  };

  if (loading) return <ActivityIndicator />;
  if (isRestricted) return <Text style={styles.restrictedText}>Sell feature unavailable in your region.</Text>;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1 }}
        cacheMode="LOAD_NO_CACHE"
        key="sell"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={true}
        onError={(syntheticEvent) => console.error('WebView error:', syntheticEvent.nativeEvent)}
        useWebKit={Platform.OS === 'ios'}  // Better camera support on iOS
        onNavigationStateChange={handleNavigationChange}  // Detect success for refresh (optional for Sell)
      />
    </ScrollView>
  );
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
  tabBar: { backgroundColor: '#edfabfff', borderRadius: 8, shadowColor: '#0606fbff', shadowOpacity: 0.1, shadowRadius: 12, elevation: 4, marginBottom:10 },
  indicator: { backgroundColor: '#0A84FF' },
  restrictedText: { flex: 1, textAlign: 'center', marginTop: 20, color: 'red', fontSize: 18 },
});

export default Buy;