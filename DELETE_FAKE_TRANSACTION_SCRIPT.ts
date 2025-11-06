/**
 * Script to Delete Fake Transaction with API Key as OrderId
 * Run this in your app to clean up the corrupted data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export async function deleteFakeApiKeyTransaction() {
  try {
    const walletAddress = '0x6cf880d3180c67f8bf2ed51d8c3346dee09f62cc';
    const storageKey = `crypto_pal_transactions_${walletAddress}`;
    
    const data = await AsyncStorage.getItem(storageKey);
    if (!data) {
      console.log('No transactions found');
      return;
    }
    
    const transactions = JSON.parse(data);
    console.log(`Found ${transactions.length} transactions`);
    
    // Filter out transaction with API key as orderId
    const cleaned = transactions.filter((tx: any) => {
      const orderId = tx.orderId;
      const isApiKey = orderId === '49362815-1fc8-4dde-ab46-72b51a21aeb3';
      
      if (isApiKey) {
        console.log('🗑️ Removing FAKE transaction with API key as orderId:', {
          id: tx.id,
          orderId: tx.orderId,
          tokenSymbol: tx.tokenSymbol,
          timestamp: tx.timestamp
        });
        return false; // Remove this transaction
      }
      
      return true; // Keep all others
    });
    
    console.log(`Cleaned: ${transactions.length} -> ${cleaned.length} transactions`);
    
    // Save cleaned transactions
    await AsyncStorage.setItem(storageKey, JSON.stringify(cleaned));
    
    console.log('✅ Fake transaction deleted successfully');
    console.log(`Remaining transactions: ${cleaned.length}`);
    
    return {
      before: transactions.length,
      after: cleaned.length,
      removed: transactions.length - cleaned.length
    };
  } catch (error) {
    console.error('Error deleting fake transaction:', error);
    throw error;
  }
}

// Usage: Call this function from your app to clean up
// deleteFakeApiKeyTransaction().then(result => console.log('Cleanup result:', result));

