import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getMnemonic } from '../utils/wallet';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'MnemonicBackup'>;

export default function MnemonicBackupScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isRestore = false, phrase: paramPhrase } = route.params || {};
  const [mnemonic, setMnemonic] = useState<string>('');

  useEffect(() => {
    const loadMnemonic = async () => {
      let loadedMnemonic = paramPhrase;
      if (!loadedMnemonic) {
        loadedMnemonic = await getMnemonic() ?? '';
      }
      setMnemonic(loadedMnemonic);
    };
    loadMnemonic();
  }, [paramPhrase]);

  return (
    <View style={styles.container}>
      <Ionicons name="shield-checkmark-outline" size={64} color="#0A84FF" style={styles.icon} />
      <Text style={styles.title}>{isRestore ? 'Restore Complete' : 'Backup Your Wallet'}</Text>

      <Text style={styles.subtitle}>
        This 12-word recovery phrase is the key to your wallet. Write it down and store it in a safe place. Never share it with anyone—it's the ONLY way to recover your funds if you lose access to this device. If you lose it, your assets are gone forever!
      </Text>

      <ScrollView style={styles.phraseContainer} contentContainerStyle={{ padding: 16 }}>
        {mnemonic ? (
          <Text selectable style={styles.phraseText}>{mnemonic}</Text> // Simple continuous list, selectable for copy
        ) : (
          <Text style={styles.empty}>Loading phrase...</Text> // Wrapped fallback
        )}
      </ScrollView>

      <TouchableOpacity style={styles.button} onPress={() => navigation.replace('AppTabs')}>
        <Text style={styles.buttonText}>I’ve backed it up — Go to Wallet</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  icon: { marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#0A84FF', textAlign: 'center', marginBottom: 16 },
  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 24 },
  phraseContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, maxHeight: 160, marginBottom: 24, width: '100%' },
  phraseText: { fontSize: 18, lineHeight: 28, color: '#111', textAlign: 'center' }, // Centered for easy reading/copy
  button: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 12, width: '80%' },
  buttonText: { textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888' },
});