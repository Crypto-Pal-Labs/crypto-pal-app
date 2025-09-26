import React, { useState } from 'react';
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Pin'>;

export default function PinSetupScreen({ route, navigation }: Props) {
  const { isSetup = true } = route.params || {};
  const { hasMnemonic, setAuthenticated, setHasPin } = useAuthStore();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const pinsMatch = isSetup ? (pin.length === 6 && pin === confirm) : pin.length === 6;

  const handleSubmit = async () => {
    console.log('PinSetup handleSubmit: isSetup=', isSetup, 'hasMnemonic=', hasMnemonic); // Log for debug
    if (isSetup) {
      try {
        await SecureStore.setItemAsync('pin', pin); // Standardized
        setHasPin(true);
        const nextScreen = hasMnemonic ? 'RestoreWallet' : 'CreateWallet';
        console.log('PIN setup—nav to', nextScreen);
        navigation.reset({ index: 0, routes: [{ name: nextScreen }] });
      } catch (error) {
        Alert.alert('Error', 'Failed to save PIN.');
      }
    } else {
      try {
        const storedPin = await SecureStore.getItemAsync('pin'); // Standardized
        if (pin === storedPin) {
          setAuthenticated(true);
          console.log('PIN unlock—nav to AppTabs');
          navigation.reset({ index: 0, routes: [{ name: 'AppTabs' }] });
        } else {
          Alert.alert('Invalid PIN', 'Try again.');
          setPin('');
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to verify PIN.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Ionicons name="lock-closed-outline" size={64} color="#0A84FF" style={styles.icon} />
        <Text style={styles.title}>{isSetup ? 'Create a 6-digit PIN' : 'Enter your PIN'}</Text>
        <Text style={styles.subtitle}>
          {isSetup ? 'Your PIN protects your wallet on this device. Keep it secret and never share it for maximum security.' : 'Enter your PIN to unlock.'}
        </Text>
        <TextInput
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          placeholder={isSetup ? 'Enter PIN' : 'Enter your PIN'}
          value={pin}
          onChangeText={setPin}
          style={styles.input}
        />
        {isSetup && (
          <TextInput
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            placeholder="Confirm PIN"
            value={confirm}
            onChangeText={setConfirm}
            style={styles.input}
          />
        )}
        <TouchableOpacity
          style={[styles.button, { opacity: pinsMatch ? 1 : 0.4 }]}
          activeOpacity={0.8}
          disabled={!pinsMatch}
          onPress={handleSubmit}
        >
          <Text style={styles.buttonText}>{isSetup ? 'Continue' : 'Unlock'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  icon: { marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#0A84FF', marginBottom: 16, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontSize: 18, marginBottom: 16 },
  button: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 12, marginTop: 8 },
  buttonText: { textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
});