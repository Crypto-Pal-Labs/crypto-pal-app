// src/screens/Wallet.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Image,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as ethers from 'ethers';
import { Picker } from '@react-native-picker/picker';
import * as Localization from 'expo-localization';

import { useAssets } from '../hooks/useAssets';
import { useChain } from '../hooks/useChain';

type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;                // base units (token decimals)
  quoteLocal?: number;
  quoteUsd?: number;
  logo_url?: string;
  contract_address?: string;
  contract_decimals?: number;
  contract_name?: string;
};

const fmt = (n: number, dp = 8) => {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(dp);
  // trim trailing zeros
  return s.replace(/\.?0+$/, '');
};

const Logo: React.FC<{ uri?: string | null; fallback: string }> = ({ uri, fallback }) => {
  if (uri) {
    return (
      <View style={styles.logoWrap}>
        <Image source={{ uri }} style={styles.logo} />
      </View>
    );
  }
  return (
    <View style={[styles.logoWrap, styles.logoFallback]}>
      <Text style={{ color: '#fff', fontWeight: '800' }}>{fallback}</Text>
    </View>
  );
};

const WalletScreen: React.FC = () => {
  const { chain, chains, activeChainId, setActiveChainId } = useChain();
  const { balances, loading, error, refresh } = useAssets();

  const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
  const localCurrency = (locale.currencyCode || 'USD').toUpperCase();

  const [currency, setCurrency] = useState<'USD' | 'LOCAL'>('LOCAL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBalances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return balances
      .filter((b) => {
        const dec = b.contract_decimals ?? 18;
        const qty = Number(ethers.utils.formatUnits(b.balance, dec));
        return qty > 0 && (q.length === 0 || (b.contract_ticker_symbol || '').toLowerCase().includes(q));
      })
      .sort((a, b) => (b.quoteUsd || 0) - (a.quoteUsd || 0));
  }, [balances, searchQuery]);

  const renderItem = ({ item }: { item: BalanceItem }) => {
    const symbol = item.contract_ticker_symbol || '—';
    const dec = item.contract_decimals ?? 18;
    const qty = Number(ethers.utils.formatUnits(item.balance, dec));
    const qtyText = `${fmt(qty)} ${symbol}`;
    const priceText =
      currency === 'USD'
        ? (item.quoteUsd != null ? `$${(item.quoteUsd).toFixed(2)}` : '—')
        : (item.quoteLocal != null ? `${(item.quoteLocal).toFixed(2)} ${localCurrency}` : `— ${localCurrency}`);
    const initials = symbol.slice(0, 1);

    return (
      <View style={styles.card}>
        <Logo uri={item.logo_url} fallback={initials} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{symbol}</Text>
          <Text style={styles.sub}>{item.contract_name || ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.qty}>{qtyText}</Text>
          <Text style={styles.fiat}>{priceText}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Network selector */}
      <View style={styles.row}>
        <Text style={styles.h1}>Wallet</Text>
        <View style={{ flex: 1 }} />
        <Picker
          selectedValue={activeChainId}
          onValueChange={(val) => setActiveChainId(Number(val))}
          style={styles.picker as any}
        >
          {chains.map((c) => (
            <Picker.Item key={c.chainId} label={`${c.shortName || c.name}`} value={c.chainId} />
          ))}
        </Picker>
      </View>

      {/* Search & currency */}
      <View style={styles.searchRow}>
        <TextInput
          placeholder="Search token symbol…"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.input}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          onPress={() => setCurrency((cur) => (cur === 'USD' ? 'LOCAL' : 'USD'))}
          style={styles.currencyBtn}
        >
          <Text style={styles.currencyText}>{currency === 'USD' ? 'USD' : localCurrency}</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading && filteredBalances.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0A84FF" />
        </View>
      ) : error ? (
        <View style={{ padding: 16 }}><Text style={{ color: 'red' }}>{String(error)}</Text></View>
      ) : (
        <FlatList
          data={filteredBalances}
          keyExtractor={(it, idx) => `${it.contract_address || 'native'}:${it.contract_ticker_symbol}:${idx}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} colors={Platform.OS === 'ios' ? undefined : ['#0A84FF']} />
          }
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#666', marginTop: 24 }}>No assets yet on {chain.shortName || chain.name}.</Text>}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 14 },
  h1: { fontSize: 26, fontWeight: '800', color: '#0A84FF' },

  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 8, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, height: 42, paddingHorizontal: 12 },
  currencyBtn: { paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#0A84FF', borderRadius: 10 },
  currencyText: { color: '#fff', fontWeight: '700' },
  picker: { minWidth: 160 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F9FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6F0FF',
    gap: 12,
  },
  logoWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F1FF',
    alignItems: 'center', justifyContent: 'center'
  },
  logoFallback: {
    backgroundColor: '#0A84FF',
  },
  logo: { width: 36, height: 36, borderRadius: 18 },
  title: { fontSize: 16, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6B7280' },
  qty: { fontSize: 14, fontWeight: '700', color: '#111' },
  fiat: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});

export default WalletScreen;
