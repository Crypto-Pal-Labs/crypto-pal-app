import { renderHook, waitFor } from '@testing-library/react-native';
import { useAssets } from '../../../hooks/useAssets';
import { mockFetch, mockCovalentAPI, mockCoinGeckoAPI } from '../../helpers/testUtils';
import { mockData } from '../../helpers/mockData';

// Mock the useWalletStore
jest.mock('../../../store/useWalletStore', () => ({
  useWalletStore: () => ({
    address: mockData.mockWalletAddresses.main,
  }),
}));

// Mock the useChain hook
jest.mock('../../../hooks/useChain', () => ({
  useChain: () => ({
    chain: mockData.mockChains[0],
    chains: mockData.mockChains,
  }),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('useAssets Hook - Error Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCovalentAPI();
    mockCoinGeckoAPI();
  });

  it('should handle successful asset fetching', async () => {
    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.balances).toBeDefined();
    expect(result.current.nfts).toBeDefined();
    expect(result.current.error).toBeNull();
  });

  it('should handle API errors gracefully', async () => {
    // Mock API error
    global.fetch = jest.fn(() => Promise.reject(new Error('API Error')));

    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // This should handle errors - potential bug!
    expect(result.current.error).toBeDefined();
    expect(result.current.balances).toEqual([]);
    expect(result.current.nfts).toEqual([]);
  });

  it('should handle empty wallet address', async () => {
    // Mock empty wallet address
    jest.doMock('../../../store/useWalletStore', () => ({
      useWalletStore: () => ({
        address: null,
      }),
    }));

    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // This should handle empty address - potential bug!
    expect(result.current.balances).toEqual([]);
    expect(result.current.nfts).toEqual([]);
  });

  it('should handle invalid wallet address format', async () => {
    // Mock invalid wallet address
    jest.doMock('../../../store/useWalletStore', () => ({
      useWalletStore: () => ({
        address: 'invalid-address',
      }),
    }));

    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // This should handle invalid address - potential bug!
    expect(result.current.balances).toEqual([]);
    expect(result.current.nfts).toEqual([]);
  });

  it('should handle network switching errors', async () => {
    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Mock network switch error
    global.fetch = jest.fn(() => Promise.reject(new Error('Network switch failed')));

    // This should handle network switch errors - potential bug!
    result.current.refresh();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeDefined();
  });

  it('should handle price fetching errors', async () => {
    // Mock price API error
    global.fetch = jest.fn((url: string | URL | Request) => {
      if (typeof url === 'string' && url.includes('coingecko')) {
        return Promise.reject(new Error('Price API error'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { items: [] } }),
      } as Response);
    });

    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // This should handle price errors - potential bug!
    expect(result.current.balances).toBeDefined();
    // Prices might be 0 or undefined - potential bug!
  });

  it('should handle memory leaks on unmount', async () => {
    const { result, unmount } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Unmount the hook
    unmount();

    // This should clean up timers and listeners - potential bug!
    // TODO: Add cleanup verification
  });

  it('should handle concurrent refresh calls', async () => {
    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Call refresh multiple times quickly
    result.current.refresh();
    result.current.refresh();
    result.current.refresh();

    // This should handle concurrent refreshes - potential bug!
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should handle malformed balance data', async () => {
    // Mock malformed balance data
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: {
          items: [
            {
              contract_ticker_symbol: null, // Invalid data
              balance: 'invalid', // Invalid balance
              logo_url: '', // Empty logo
            }
          ]
        }
      }),
    } as Response));

    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // This should handle malformed data - potential bug!
    expect(result.current.balances).toBeDefined();
    // TODO: Add data validation
  });
});