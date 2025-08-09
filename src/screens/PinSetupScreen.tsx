// src/screens/PinSetupScreen.tsx
import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function PinSetupScreen() {
  const navigation = useNavigation();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');

  const pinsMatch = pin.length === 6 && pin === confirm;

  const handleContinue = () => {
    // TODO: optionally persist the PIN with SecureStore
    navigation.replace('CreateWallet');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Create a 6-digit PIN</Text>

        <TextInput
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          placeholder="Enter PIN"
          value={pin}
          onChangeText={setPin}
          style={styles.input}
        />

        <TextInput
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          placeholder="Confirm PIN"
          value={confirm}
          onChangeText={setConfirm}
          style={styles.input}
        />

        <TouchableOpacity
          style={[
            styles.button,
            { opacity: pinsMatch ? 1 : 0.4 },
          ]}
          activeOpacity={0.8}
          disabled={!pinsMatch}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0A84FF',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#0A84FF',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonText: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});


