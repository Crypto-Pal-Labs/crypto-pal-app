import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { getWalletAddress } from '../utils/wallet';
import { useFocusEffect } from '@react-navigation/native';  // For reload on focus
import * as Localization from 'expo-localization';  // For geo and currency
import { useAssets } from '../hooks/useAssets';  // For refresh after buy

const BuyRoute = () => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const { refresh } = useAssets();  // Correct hook method for refresh

  // Hardcoded Transak API key for test (bypass bundling—remove after)
  const TRANSAK_API_KEY = '49362815-1fc8-4dde-ab46-72b51a21aeb3';

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

  const handleNavigationChange = (event: { url: string }) => { // Type event to fix TS7006
    if (event.url.includes('transak.com') && event.url.includes('success')) {
      refresh();  // Refresh balances on success (optional for Buy)
    }
  };

  if (loading) return <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />;
  if (isRestricted) return <Text style={styles.restrictedText}>Buy is restricted in your region.</Text>;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
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
  const { refresh } = useAssets();  // Refresh after sell

  // Hardcoded Transak API key for test (bypass bundling—remove after)
  const TRANSAK_API_KEY = '49362815-1fc8-4dde-ab46-72b51a21aeb3';

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
          const newUri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&walletAddress=${addr || ''}&defaultFiatCurrency=${defaultFiat}&defaultFiatAmount=10&defaultCryptoCurrency=USDC&defaultPaymentMethod=credit_card&productsAvailed=SELL&defaultProduct=SELL&isBuyOrSell=SELL&environment=STAGING&network=sepolia&disableWalletAddressForm=true`;
          setUri(newUri);
          console.log('Sell URI reloaded:', newUri);
        }
        setLoading(false);
      });
    }, [])
  );

  const handleNavigationChange = (event: { url: string }) => { // Type event to fix TS7006
    if (event.url.includes('transak.com') && event.url.includes('success')) {
      refresh();  // Refresh balances on success (optional for Sell)
    }
  };

  if (loading) return <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />;
  if (isRestricted) return <Text style={styles.restrictedText}>Sell is restricted in your region.</Text>;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
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
        onNavigationStateChange={handleNavigationChange}  // Detect success for refresh
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, // Added to fix TS2339
});

export default Buy;