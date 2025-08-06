import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function Buy() {
  return (
    <View style={styles.container}>
      <WebView
        source={{
          uri: `https://global.transak.com?apiKey=YOUR_API_KEY&defaultFiatCurrency=NZD`
        }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }
});



