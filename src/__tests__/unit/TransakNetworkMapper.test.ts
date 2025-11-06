/**
 * Unit tests for TransakNetworkMapper
 * Tests all network mappings to ensure complete coverage
 */

import { mapTransakNetwork, isNonEvmToken } from '../../services/TransakNetworkMapper';

describe('TransakNetworkMapper', () => {
  describe('EVM Networks', () => {
    test('maps Ethereum mainnet correctly', () => {
      const result = mapTransakNetwork('ethereum', 'ETH', false);
      expect(result).toEqual({
        chainId: 1,
        networkName: 'Ethereum',
        isEvm: true,
      });
    });

    test('maps Ethereum Sepolia testnet correctly', () => {
      const result = mapTransakNetwork('ethereum', 'ETH', true);
      expect(result).toEqual({
        chainId: 11155111,
        networkName: 'Sepolia',
        isEvm: true,
      });
    });

    test('maps Polygon mainnet correctly', () => {
      const result = mapTransakNetwork('polygon', 'MATIC', false);
      expect(result).toEqual({
        chainId: 137,
        networkName: 'Polygon',
        isEvm: true,
      });
    });

    test('maps BSC mainnet correctly', () => {
      const result = mapTransakNetwork('bsc', 'BNB', false);
      expect(result).toEqual({
        chainId: 56,
        networkName: 'BSC',
        isEvm: true,
      });
    });

    test('maps Arbitrum correctly', () => {
      const result = mapTransakNetwork('arbitrum', 'ARB', false);
      expect(result).toEqual({
        chainId: 42161,
        networkName: 'Arbitrum',
        isEvm: true,
      });
    });

    test('maps Optimism correctly', () => {
      const result = mapTransakNetwork('optimism', 'OP', false);
      expect(result).toEqual({
        chainId: 10,
        networkName: 'Optimism',
        isEvm: true,
      });
    });

    test('maps Avalanche correctly', () => {
      const result = mapTransakNetwork('avalanche', 'AVAX', false);
      expect(result).toEqual({
        chainId: 43114,
        networkName: 'Avalanche',
        isEvm: true,
      });
    });

    test('maps Base correctly', () => {
      const result = mapTransakNetwork('base', 'ETH', false);
      expect(result).toEqual({
        chainId: 8453,
        networkName: 'Base',
        isEvm: true,
      });
    });

    test('maps Linea correctly', () => {
      const result = mapTransakNetwork('linea', 'ETH', false);
      expect(result).toEqual({
        chainId: 59144,
        networkName: 'Linea',
        isEvm: true,
      });
    });

    test('maps Fantom correctly', () => {
      const result = mapTransakNetwork('fantom', 'FTM', false);
      expect(result).toEqual({
        chainId: 250,
        networkName: 'Fantom',
        isEvm: true,
      });
    });

    test('maps Celo correctly', () => {
      const result = mapTransakNetwork('celo', 'CELO', false);
      expect(result).toEqual({
        chainId: 42220,
        networkName: 'Celo',
        isEvm: true,
      });
    });

    test('maps Gnosis correctly', () => {
      const result = mapTransakNetwork('gnosis', 'XDAI', false);
      expect(result).toEqual({
        chainId: 100,
        networkName: 'Gnosis',
        isEvm: true,
      });
    });

    test('maps Moonbeam correctly', () => {
      const result = mapTransakNetwork('moonbeam', 'GLMR', false);
      expect(result).toEqual({
        chainId: 1284,
        networkName: 'Moonbeam',
        isEvm: true,
      });
    });

    test('maps Moonriver correctly', () => {
      const result = mapTransakNetwork('moonriver', 'MOVR', false);
      expect(result).toEqual({
        chainId: 1285,
        networkName: 'Moonriver',
        isEvm: true,
      });
    });

    test('maps Cronos correctly', () => {
      const result = mapTransakNetwork('cronos', 'CRO', false);
      expect(result).toEqual({
        chainId: 25,
        networkName: 'Cronos',
        isEvm: true,
      });
    });

    test('maps zkSync Era correctly', () => {
      const result = mapTransakNetwork('zksync era', 'ETH', false);
      expect(result).toEqual({
        chainId: 324,
        networkName: 'zkSync Era',
        isEvm: true,
      });
    });

    test('maps Scroll correctly', () => {
      const result = mapTransakNetwork('scroll', 'ETH', false);
      expect(result).toEqual({
        chainId: 534352,
        networkName: 'Scroll',
        isEvm: true,
      });
    });

    test('maps Mantle correctly', () => {
      const result = mapTransakNetwork('mantle', 'MNT', false);
      expect(result).toEqual({
        chainId: 5000,
        networkName: 'Mantle',
        isEvm: true,
      });
    });

    test('maps Blast correctly', () => {
      const result = mapTransakNetwork('blast', 'ETH', false);
      expect(result).toEqual({
        chainId: 81457,
        networkName: 'Blast',
        isEvm: true,
      });
    });

    test('maps OKC correctly', () => {
      const result = mapTransakNetwork('okc', 'OKB', false);
      expect(result).toEqual({
        chainId: 66,
        networkName: 'OKC',
        isEvm: true,
      });
    });

    test('maps Harmony correctly', () => {
      const result = mapTransakNetwork('harmony', 'ONE', false);
      expect(result).toEqual({
        chainId: 1666600000,
        networkName: 'Harmony',
        isEvm: true,
      });
    });
  });

  describe('Non-EVM Networks', () => {
    test('maps Bitcoin correctly', () => {
      const result = mapTransakNetwork('bitcoin', 'BTC', false);
      expect(result).toEqual({
        chainId: 0,
        networkName: 'Bitcoin',
        isEvm: false,
      });
    });

    test('maps Solana correctly', () => {
      const result = mapTransakNetwork('solana', 'SOL', false);
      expect(result).toEqual({
        chainId: 999999,
        networkName: 'Solana',
        isEvm: false,
      });
    });

    test('maps Ripple correctly', () => {
      const result = mapTransakNetwork('ripple', 'XRP', false);
      expect(result).toEqual({
        chainId: 999998,
        networkName: 'Ripple',
        isEvm: false,
      });
    });

    test('maps Stellar correctly', () => {
      const result = mapTransakNetwork('stellar', 'XLM', false);
      expect(result).toEqual({
        chainId: 999997,
        networkName: 'Stellar',
        isEvm: false,
      });
    });

    test('maps Cardano correctly', () => {
      const result = mapTransakNetwork('cardano', 'ADA', false);
      expect(result).toEqual({
        chainId: 999996,
        networkName: 'Cardano',
        isEvm: false,
      });
    });

    test('maps Tron correctly', () => {
      const result = mapTransakNetwork('tron', 'TRX', false);
      expect(result).toEqual({
        chainId: 999995,
        networkName: 'Tron',
        isEvm: false,
      });
    });

    test('maps Dogecoin correctly', () => {
      const result = mapTransakNetwork('dogecoin', 'DOGE', false);
      expect(result).toEqual({
        chainId: 999994,
        networkName: 'Dogecoin',
        isEvm: false,
      });
    });

    test('maps Litecoin correctly', () => {
      const result = mapTransakNetwork('litecoin', 'LTC', false);
      expect(result).toEqual({
        chainId: 999993,
        networkName: 'Litecoin',
        isEvm: false,
      });
    });

    test('maps Bitcoin Cash correctly', () => {
      const result = mapTransakNetwork('bitcoin cash', 'BCH', false);
      expect(result).toEqual({
        chainId: 999992,
        networkName: 'Bitcoin Cash',
        isEvm: false,
      });
    });

    test('maps Cosmos correctly', () => {
      const result = mapTransakNetwork('cosmos', 'ATOM', false);
      expect(result).toEqual({
        chainId: 999991,
        networkName: 'Cosmos',
        isEvm: false,
      });
    });

    test('maps Polkadot correctly', () => {
      const result = mapTransakNetwork('polkadot', 'DOT', false);
      expect(result).toEqual({
        chainId: 999990,
        networkName: 'Polkadot',
        isEvm: false,
      });
    });

    test('maps Near correctly', () => {
      const result = mapTransakNetwork('near', 'NEAR', false);
      expect(result).toEqual({
        chainId: 999989,
        networkName: 'Near',
        isEvm: false,
      });
    });

    test('maps Algorand correctly', () => {
      const result = mapTransakNetwork('algorand', 'ALGO', false);
      expect(result).toEqual({
        chainId: 999988,
        networkName: 'Algorand',
        isEvm: false,
      });
    });

    test('maps Tezos correctly', () => {
      const result = mapTransakNetwork('tezos', 'XTZ', false);
      expect(result).toEqual({
        chainId: 999987,
        networkName: 'Tezos',
        isEvm: false,
      });
    });

    test('maps TON correctly', () => {
      const result = mapTransakNetwork('ton', 'TON', false);
      expect(result).toEqual({
        chainId: 999986,
        networkName: 'TON',
        isEvm: false,
      });
    });
  });

  describe('Fallback Logic', () => {
    test('falls back to cryptoCurrency when network is missing', () => {
      const result = mapTransakNetwork(undefined, 'ETH', false);
      expect(result.chainId).toBe(1);
      expect(result.networkName).toBe('Ethereum');
    });

    test('falls back to cryptoCurrency for MATIC', () => {
      const result = mapTransakNetwork(undefined, 'MATIC', false);
      expect(result.chainId).toBe(137);
      expect(result.networkName).toBe('Polygon');
    });

    test('falls back to cryptoCurrency for BNB', () => {
      const result = mapTransakNetwork(undefined, 'BNB', false);
      expect(result.chainId).toBe(56);
      expect(result.networkName).toBe('BSC');
    });

    test('falls back to cryptoCurrency for BTC', () => {
      const result = mapTransakNetwork(undefined, 'BTC', false);
      expect(result.chainId).toBe(0);
      expect(result.networkName).toBe('Bitcoin');
      expect(result.isEvm).toBe(false);
    });

    test('falls back to default staging testnet for unknown network', () => {
      const result = mapTransakNetwork('unknown-network', 'UNKNOWN', true);
      expect(result.chainId).toBe(11155111);
      expect(result.networkName).toBe('Sepolia');
    });
  });

  describe('isNonEvmToken', () => {
    test('correctly identifies non-EVM tokens', () => {
      expect(isNonEvmToken('BTC')).toBe(true);
      expect(isNonEvmToken('SOL')).toBe(true);
      expect(isNonEvmToken('XRP')).toBe(true);
      expect(isNonEvmToken('ADA')).toBe(true);
      expect(isNonEvmToken('TRX')).toBe(true);
      expect(isNonEvmToken('XLM')).toBe(true);
      expect(isNonEvmToken('DOGE')).toBe(true);
      expect(isNonEvmToken('TON')).toBe(true);
      expect(isNonEvmToken('BCH')).toBe(true);
      expect(isNonEvmToken('LTC')).toBe(true);
      expect(isNonEvmToken('ATOM')).toBe(true);
      expect(isNonEvmToken('DOT')).toBe(true);
      expect(isNonEvmToken('NEAR')).toBe(true);
      expect(isNonEvmToken('ALGO')).toBe(true);
      expect(isNonEvmToken('XTZ')).toBe(true);
    });

    test('correctly identifies EVM tokens', () => {
      expect(isNonEvmToken('ETH')).toBe(false);
      expect(isNonEvmToken('MATIC')).toBe(false);
      expect(isNonEvmToken('BNB')).toBe(false);
      expect(isNonEvmToken('USDC')).toBe(false);
      expect(isNonEvmToken('USDT')).toBe(false);
      expect(isNonEvmToken('DAI')).toBe(false);
    });

    test('handles undefined and empty strings', () => {
      expect(isNonEvmToken(undefined)).toBe(false);
      expect(isNonEvmToken('')).toBe(false);
    });
  });
});

