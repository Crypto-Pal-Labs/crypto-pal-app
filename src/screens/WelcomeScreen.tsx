import React, { useEffect } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack'; // Updated import
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList } from '../types/navigation'; // New types

type NavigationProp = NativeStackNavigationProp<RootStackParamList>; // Updated type

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { hasMnemonic, hasPin } = useAuthStore();

  useEffect(() => {
    if (hasMnemonic && hasPin) {
      navigation.reset({ index: 0, routes: [{ name: 'Pin', params: { isSetup: false } }] });
    } else if (hasMnemonic && !hasPin) {
      navigation.navigate('Pin', { isSetup: true });
    }
    // Else: Stay for new users
  }, [hasMnemonic, hasPin, navigation]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Ionicons name="wallet-outline" size={64} color="#0A84FF" style={styles.icon} />
        <Text style={styles.title}>Welcome to Crypto Pal</Text>
        <Text style={styles.subtitle}>
          Crypto Pal is your secure self-custody wallet. You control your keys—never shared with us. Start by setting a PIN and backing up your recovery phrase for safe access to buy, hold, sell crypto/NFTs, and pay/receive easily.
        </Text>
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Pin', { isSetup: true })}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  icon: { marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '700', color: '#0A84FF', marginBottom: 16, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 40 },
  button: { backgroundColor: '#0A84FF', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});