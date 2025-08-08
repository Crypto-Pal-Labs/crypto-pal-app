// src/screens/WalletScreen.tsx
import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useBalances } from '../hooks/useBalances';
import { useWalletStore } from '../store/useWalletStore';

export default function WalletScreen() {
  // 1️⃣ Fetch balances from Covalent
  const balances = useBalances();

  // 2️⃣ Global store setters & values
  const setBalances = useWalletStore((s) => s.setBalances);
  const chainId     = useWalletStore((s) => s.chainId);
  const setChainId  = useWalletStore((s) => s.setChainId);

  // 3️⃣ Push balances into the store
  useEffect(() => {
    setBalances(balances);
  }, [balances]);

  // 4️⃣ UI
  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Portfolio</Text>

      {/* Chain selector */}
      <View style={styles.chainToggleContainer}>
        {[
          { id: 1,  label: 'Ethereum' },
          { id: 56, label: 'BSC'      },
        ].map((chain) => {
          const selected = chainId === chain.id;
          return (
            <TouchableOpacity
              key={chain.id}
              style={[
                styles.chainButton,
                selected
                  ? styles.chainButtonActive
                  : styles.chainButtonInactive,
              ]}
              onPress={() => setChainId(chain.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chainButtonText,
                  selected
                    ? styles.chainButtonTextActive
                    : styles.chainButtonTextInactive,
                ]}
              >
                {chain.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Balances list */}
      <FlatList
        data={balances}
        keyExtractor={(item) => item.contract_ticker_symbol}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Image
              source={{ uri: item.logo_url }}
              style={styles.logo}
            />
            <Text style={styles.symbol}>
              {item.contract_ticker_symbol}
            </Text>
            <Text style={styles.quote}>
              NZ${item.quote.toFixed(2)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No balances to display.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },

  chainToggleContainer: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0A84FF',
  },
  chainButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  chainButtonActive: {
    backgroundColor: '#0A84FF',
  },
  chainButtonInactive: {
    backgroundColor: '#fff',
  },
  chainButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chainButtonTextActive: {
    color: '#fff',
  },
  chainButtonTextInactive: {
    color: '#0A84FF',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  symbol: {
    flex: 1,
    fontSize: 16,
  },
  quote: {
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    color: '#888',
  },
});
