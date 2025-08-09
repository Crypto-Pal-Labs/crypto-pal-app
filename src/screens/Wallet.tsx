// src/screens/Wallet.tsx
import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  Button,
} from 'react-native';
import { resetRoot } from '../navigation/RootNavigation';
import { useBalances } from '../hooks/useBalances';
import { useWalletStore } from '../store/useWalletStore';
import { clearMnemonic } from '../utils/wallet';

export default function WalletScreen() {
  const balances    = useBalances();
  const setBalances = useWalletStore((s) => s.setBalances);
  const chainId     = useWalletStore((s) => s.chainId);
  const setChainId  = useWalletStore((s) => s.setChainId);

  useEffect(() => {
    setBalances(balances);
  }, [balances]);

  const handleLogout = async () => {
    await clearMnemonic();
    resetRoot([{ name: 'Welcome' }]);        // ← jump to onboarding
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Portfolio</Text>

      {/* Chain toggle */}
      <View style={styles.chainToggleContainer}>
        {[{ id: 1, label: 'Ethereum' }, { id: 56, label: 'BSC' }].map((c) => {
          const selected = chainId === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.chainButton,
                selected ? styles.chainButtonActive : styles.chainButtonInactive,
              ]}
              onPress={() => setChainId(c.id)}
              activeOpacity={0.7}
            >
              <Text
                style={
                  selected ? styles.chainButtonTextActive : styles.chainButtonTextInactive
                }
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Balances */}
      <FlatList
        data={balances}
        keyExtractor={(it) => it.contract_ticker_symbol}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Image source={{ uri: item.logo_url }} style={styles.logo} />
            <Text style={styles.symbol}>{item.contract_ticker_symbol}</Text>
            <Text style={styles.quote}>NZ${item.quote.toFixed(2)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No balances to display.</Text>
        }
      />

      {/* Logout */}
      <View style={styles.logoutContainer}>
        <Button
          title="Logout / Reset Wallet"
          color="#D32F2F"
          onPress={handleLogout}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, padding: 16, backgroundColor: '#fff' },
  header:               { fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  chainToggleContainer: { flexDirection: 'row', alignSelf: 'center', borderRadius: 8,
                          overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: '#0A84FF' },
  chainButton:          { flex: 1, paddingVertical: 8, alignItems: 'center' },
  chainButtonActive:    { backgroundColor: '#0A84FF' },
  chainButtonInactive:  { backgroundColor: '#fff' },
  chainButtonTextActive:{ color: '#fff', fontWeight: '600' },
  chainButtonTextInactive:{ color: '#0A84FF', fontWeight: '600' },
  row:                  { flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
                          borderBottomColor: '#eee', borderBottomWidth: 1 },
  logo:                 { width: 32, height: 32, marginRight: 12 },
  symbol:               { flex: 1, fontSize: 16 },
  quote:                { fontSize: 16, fontWeight: '600' },
  empty:                { textAlign: 'center', marginTop: 32, color: '#888' },
  logoutContainer:      { marginTop: 24 },
});
