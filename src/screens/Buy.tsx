import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview'; // Already in deps
import { SafeAreaView } from 'react-native-safe-area-context'; // Already in deps

export default function Buy() {
  const [selectedTab, setSelectedTab] = useState('buy');

  const renderContent = () => {
    switch (selectedTab) {
      case 'buy':
        return (
          <View style={styles.content}>
            <Text>Buy coming soon after Transak key activation</Text>
          </View>
        );
      case 'sell':
        return (
          <View style={styles.content}>
            <Text>Sell coming soon after Transak key activation</Text>
          </View>
        );
      case 'swap':
        return (
          <WebView
            source={{ uri: 'https://app.uniswap.org/swap' }}
            style={{ flex: 1 }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Trade</Text>
      <View style={styles.tabRow}>
        <View style={[styles.tabButton, selectedTab === 'buy' ? styles.selectedTab : styles.unselectedTab]}>
          <Text style={[styles.tabText, selectedTab === 'buy' ? styles.selectedText : styles.unselectedText]} onPress={() => setSelectedTab('buy')}>
            Buy
          </Text>
        </View>
        <View style={[styles.tabButton, selectedTab === 'sell' ? styles.selectedTab : styles.unselectedTab]}>
          <Text style={[styles.tabText, selectedTab === 'sell' ? styles.selectedText : styles.unselectedText]} onPress={() => setSelectedTab('sell')}>
            Sell
          </Text>
        </View>
        <View style={[styles.tabButton, selectedTab === 'swap' ? styles.selectedTab : styles.unselectedTab]}>
          <Text style={[styles.tabText, selectedTab === 'swap' ? styles.selectedText : styles.unselectedText]} onPress={() => setSelectedTab('swap')}>
            Swap
          </Text>
        </View>
      </View>
      {renderContent()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  heading: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginVertical: 16 },
  tabRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, backgroundColor: '#0A84FF', borderRadius: 25, padding: 4 },
  tabButton: { flex: 1, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  selectedTab: { backgroundColor: '#0A84FF' },
  unselectedTab: { backgroundColor: '#fff' },
  tabText: { textAlign: 'center', fontSize: 16, fontWeight: 'bold' },
  selectedText: { color: '#fff' },
  unselectedText: { color: '#0A84FF' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});