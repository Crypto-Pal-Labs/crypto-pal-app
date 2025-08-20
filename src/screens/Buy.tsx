import "react-native-get-random-values";
import "@ethersproject/shims";
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Button, TextInput, Alert } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { Picker } from '@react-native-picker/picker';
import { getWalletAddress } from '../utils/wallet';
import { TRANSAK_API_KEY, ONE_INCH_API_KEY } from '@env';
import { useNavigation } from '@react-navigation/native';
import { tokens } from '../utils/tokens';
import { ethers } from 'ethers';

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
    setLoading(false);
  }, []);
  const uri = `https://staging-global.transak.com?apiKey=${TRANSAK_API_KEY}&cryptoCurrency=USDC&cryptoAmount=1&fiatCurrency=NZD&paymentMethod=bank_transfer&productsAvailed=SELL&product=SELL&disableWalletAddressCheck=true&isTestingMode=true&environment=STAGING&network=ethereum`;
  console.log('Sell URI:', uri);
  if (loading) return <ActivityIndicator />;
  return <WebView source={{ uri }} style={{ flex: 1 }} />;
};

const SwapRoute = () => {
  const [fromToken, setFromToken] = useState(tokens[0]);
  const [toToken, setToToken] = useState(tokens[1]);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);

  const getQuote = async () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a positive number.');
      return;
    }
    setLoading(true);
    try {
      const chainId = fromToken.chainId;
      const decimals = fromToken.symbol === 'USDC' ? 6 : 18;
      const amountWei = ethers.parseUnits(amount, decimals);
      const response = await fetch(`https://api.1inch.io/v5.0/${chainId}/quote?fromTokenAddress=${fromToken.address}&toTokenAddress=${toToken.address}&amount=${amountWei.toString()}`, {
        headers: { Authorization: `Bearer ${ONE_INCH_API_KEY}` }
      });
      console.log('API Response Status:', response.status);
      const data = await response.json();
      console.log('API Response Data:', data);
      if (!response.ok) throw new Error(`API failed with status ${response.status}`);
      if (data.error) throw new Error(data.description || 'Unknown API error');
      const toDecimals = toToken.symbol === 'USDC' ? 6 : 18;
      const toAmount = ethers.formatUnits(data.toTokenAmount, toDecimals);
      const slippage = 1;
      const fee = (data.estimatedGas / 1e6).toFixed(2);
      setQuote({ toAmount, fee, slippage });
    } catch (error) {
      Alert.alert('Error', 'Quote failed - check connection or amount.');
      console.error('Detailed Quote Error:', error.message || error);
    }
    setLoading(false);
  };
  const executeSwap = () => {};

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#000' }}>
      <Text style={{ color: '#fff', fontSize: 18, marginBottom: 8 }}>From</Text>
      <Picker selectedValue={fromToken.symbol} onValueChange={(val) => setFromToken(tokens.find(t => t.symbol === val) || tokens[0])} style={{ backgroundColor: '#333', color: '#fff' }}>
        {tokens.map(t => <Picker.Item key={t.symbol} label={t.symbol} value={t.symbol} />)}
      </Picker>
      <TextInput placeholder="Amount" placeholderTextColor="#ccc" value={amount} onChangeText={setAmount} keyboardType="numeric" style={{ borderWidth: 1, borderColor: '#333', backgroundColor: '#222', color: '#fff', padding: 8, marginVertical: 16 }} />
      <Text style={{ color: '#fff', fontSize: 18, marginBottom: 8 }}>To</Text>
      <Picker selectedValue={toToken.symbol} onValueChange={(val) => setToToken(tokens.find(t => t.symbol === val) || tokens[1])} style={{ backgroundColor: '#333', color: '#fff' }}>
        {tokens.map(t => <Picker.Item key={t.symbol} label={t.symbol} value={t.symbol} />)}
      </Picker>
      {quote && <View style={{ marginTop: 16 }}><Text style={{ color: '#fff' }}>Receive: {quote.toAmount} {toToken.symbol} (Slippage impact: {quote.slippage}%)</Text><Text style={{ color: '#fff' }}>Provider Fee: ${quote.fee}</Text></View>}
      <Button title="Get Quote" onPress={getQuote} disabled={!amount || fromToken.chainId !== toToken.chainId || loading} color="#0A84FF" />
      <Text style={{ color: '#fff', textAlign: 'center', marginTop: 8 }}>Swap feature deferred for now</Text>
      <View style={{ marginTop: 8 }}><Button title="Swap" onPress={executeSwap} disabled={!quote || loading} color="#0A84FF" /></View>
      {loading && <ActivityIndicator color="#0A84FF" style={{ marginTop: 16 }} />}
    </View>
  );
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
        initialLayout={ { width: layout.width } }
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