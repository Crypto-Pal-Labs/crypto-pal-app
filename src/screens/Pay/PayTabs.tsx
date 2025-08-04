import React from 'react';
import { View, Button, StyleSheet } from 'react-native';
import ScanTab    from './ScanTab';
import ReceiveTab from './ReceiveTab';

export default function PayTabs() {
  const [activeTab, setActiveTab] = React.useState<'Scan' | 'Receive'>('Scan');

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <Button
          title="Scan"
          onPress={() => setActiveTab('Scan')}
          color={activeTab === 'Scan' ? '#007AFF' : '#888'}
        />
        <Button
          title="Receive"
          onPress={() => setActiveTab('Receive')}
          color={activeTab === 'Receive' ? '#007AFF' : '#888'}
        />
      </View>

      <View style={styles.content}>
        {activeTab === 'Scan' ? <ScanTab /> : <ReceiveTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar:    { flexDirection: 'row', justifyContent: 'space-around', padding: 10 },
  content:   { flex: 1 },
});

