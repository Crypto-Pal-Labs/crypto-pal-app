// src/components/PriceDisplay.tsx
// Enhanced price display component with market and Transak pricing

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { priceService } from '../services/PriceService';

interface PriceDisplayProps {
  symbol: string;
  amount: number;
  localCurrency: string;
  showTransakPrices?: boolean;
  onPricePress?: (priceData: any) => void;
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  symbol,
  amount,
  localCurrency,
  showTransakPrices = false,
  onPricePress
}) => {
  const [priceData, setPriceData] = useState<{
    market: any;
    transak: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        setLoading(true);
        const prices = await priceService.getAggregatedPrices([symbol], localCurrency);
        setPriceData(prices);
      } catch (error) {
        console.error('PriceDisplay: Error fetching prices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
  }, [symbol, localCurrency]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading prices...</Text>
      </View>
    );
  }

  if (!priceData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Price unavailable</Text>
      </View>
    );
  }

  const marketPrice = priceData.market[symbol];
  const transakPrice = priceData.transak[symbol];

  const formatPrice = (price: number, currency: string) => {
    return `${currency}${price.toFixed(2)}`;
  };

  const formatAmount = (amount: number, price: number) => {
    return (amount * price).toFixed(2);
  };

  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={() => onPricePress?.(priceData)}
      disabled={!onPricePress}
    >
      {/* Market Price */}
      {marketPrice && (
        <View style={styles.priceRow}>
          <Text style={styles.label}>Market Price:</Text>
          <Text style={styles.price}>
            {formatPrice(marketPrice.usd, 'USD')} / {formatPrice(marketPrice.local, localCurrency)}
          </Text>
        </View>
      )}

      {/* Transak Prices */}
      {showTransakPrices && transakPrice && (
        <View style={styles.transakContainer}>
          <Text style={styles.transakLabel}>Transak Prices:</Text>
          
          <View style={styles.priceRow}>
            <Text style={styles.label}>Buy:</Text>
            <Text style={styles.buyPrice}>
              {formatPrice(transakPrice.buyPrice, 'USD')}
            </Text>
          </View>
          
          <View style={styles.priceRow}>
            <Text style={styles.label}>Sell:</Text>
            <Text style={styles.sellPrice}>
              {formatPrice(transakPrice.sellPrice, 'USD')}
            </Text>
          </View>
        </View>
      )}

      {/* Value Calculation */}
      {marketPrice && (
        <View style={styles.valueContainer}>
          <Text style={styles.valueLabel}>
            {amount} {symbol} = {formatAmount(amount, marketPrice.usd)} USD
          </Text>
          {marketPrice.local !== marketPrice.usd && (
            <Text style={styles.valueLabel}>
              = {formatAmount(amount, marketPrice.local)} {localCurrency}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginVertical: 4,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#e74c3c',
    textAlign: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  price: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '600',
  },
  transakContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  transakLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: 4,
  },
  buyPrice: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
  },
  sellPrice: {
    fontSize: 14,
    color: '#e74c3c',
    fontWeight: '600',
  },
  valueContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  valueLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});

