// src/screens/History.tsx
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet, Linking } from 'react-native';
import { useWalletStore } from '../store/useWalletStore';
import { useHistory } from '../hooks/useHistory';
import { ChainId } from '../utils/eth';

export default function History() {
  const chainId = useWalletStore(s => s.chainId) as ChainId;
  const { loading, items, error, refetch } = useHistory(chainId);

  return (
    <View style={{ flex:1, padding:16 }}>
      <Text style={styles.h1}>History</Text>

      {error ? (
        <View><Text style={styles.error}>Failed to load: {error}</Text>
          <TouchableOpacity onPress={refetch}><Text style={styles.link}>Retry</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.hash}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
          ListEmptyComponent={!loading ? <Text style={styles.empty}>No transactions yet.</Text> : null}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => Linking.openURL(item.link)} style={styles.row}>
              <Text style={[styles.dir, item.direction === 'out' ? styles.out : styles.in]}>
                {item.direction.toUpperCase()}
              </Text>
              <View style={{ flex:1 }}>
                <Text style={styles.primary}>{item.value} {item.symbol}</Text>
                <Text style={styles.sub}>{new Date(item.timestamp).toLocaleString()}</Text>
              </View>
              <Text style={[styles.status, item.status !== 'success' && styles.pending]}>{item.status}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  h1:{ fontSize:28, fontWeight:'800', marginBottom:8 },
  empty:{ color:'#777', marginTop:20 },
  error:{ color:'#b00020' },
  link:{ color:'#1976f6', marginTop:8, fontWeight:'700' },
  row:{ paddingVertical:12, borderBottomWidth:1, borderColor:'#eee', flexDirection:'row', alignItems:'center', gap:12 },
  dir:{ fontWeight:'800' }, out:{ color:'#b00020' }, in:{ color:'#1b8a2f' },
  primary:{ fontWeight:'700' }, sub:{ color:'#666', fontSize:12 },
  status:{ textTransform:'capitalize', color:'#1b8a2f' },
  pending:{ color:'#996800' }
});
