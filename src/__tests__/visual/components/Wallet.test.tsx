import React from 'react';
import { render } from '../../helpers/testUtils';
import Wallet from '../../../screens/Wallet';
import { mockData } from '../../helpers/mockData';

// Mock the hooks
jest.mock('../../../hooks/useAssets', () => ({
  useAssets: () => ({
    balances: mockData.mockBalanceItems,
    nfts: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
    startTimers: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useChain', () => ({
  useChain: () => ({
    chain: mockData.mockChains[0],
    chains: mockData.mockChains,
    activeChainId: 80002,
    setActiveChainId: jest.fn(),
  }),
}));

jest.mock('../../../store/useWalletStore', () => ({
  useWalletStore: () => ({
    address: mockData.mockWalletAddresses.main,
  }),
}));

describe('Wallet Screen Visual Tests', () => {
  it('should render wallet screen with all networks option', () => {
    const { getByText, getByTestId } = render(<Wallet />);

    // Check if main elements are rendered
    expect(getByText('Wallet Home')).toBeTruthy();
    expect(getByText('All Networks')).toBeTruthy();
    expect(getByText('USD')).toBeTruthy();
  });

  it('should display balance items correctly', () => {
    const { getByText } = render(<Wallet />);

    // Check if balance items are displayed
    expect(getByText('MATIC')).toBeTruthy();
    expect(getByText('ETH')).toBeTruthy();
    expect(getByText('USDC')).toBeTruthy();
  });

  it('should show correct price formatting', () => {
    const { getByText } = render(<Wallet />);

    // Check if prices are formatted correctly
    expect(getByText('$0.98')).toBeTruthy(); // 1.5 MATIC * $0.65
    expect(getByText('$2,000.00')).toBeTruthy(); // 1 ETH * $2000
    expect(getByText('$100.00')).toBeTruthy(); // 100 USDC * $1
  });

  it('should display 24h price changes with correct colors', () => {
    const { getByText } = render(<Wallet />);

    // This would need actual price change data in the mock
    // For now, just check that the component renders without errors
    expect(getByText('Wallet Home')).toBeTruthy();
  });

  it('should handle network switching', () => {
    const { getByText } = render(<Wallet />);

    // Check if network picker is present
    expect(getByText('All Networks')).toBeTruthy();
    expect(getByText('Polygon · Amoy')).toBeTruthy();
    expect(getByText('Ethereum · Sepolia')).toBeTruthy();
  });

  it('should handle currency switching', () => {
    const { getByText } = render(<Wallet />);

    // Check if currency picker is present
    expect(getByText('USD')).toBeTruthy();
    // Add more currency options as needed
  });

  it('should display search functionality', () => {
    const { getByPlaceholderText } = render(<Wallet />);

    // Check if search input is present
    expect(getByPlaceholderText('Search tokens...')).toBeTruthy();
  });

  it('should handle empty state when no balances', () => {
    // Mock empty balances
    jest.doMock('../../../hooks/useAssets', () => ({
      useAssets: () => ({
        balances: [],
        nfts: [],
        loading: false,
        error: null,
        refresh: jest.fn(),
        startTimers: jest.fn(),
      }),
    }));

    const { getByText } = render(<Wallet />);
    expect(getByText('No tokens to display yet')).toBeTruthy();
  });

  it('should handle loading state', () => {
    // Mock loading state
    jest.doMock('../../../hooks/useAssets', () => ({
      useAssets: () => ({
        balances: [],
        nfts: [],
        loading: true,
        error: null,
        refresh: jest.fn(),
        startTimers: jest.fn(),
      }),
    }));

    const { getByTestId } = render(<Wallet />);
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('should handle error state', () => {
    // Mock error state
    jest.doMock('../../../hooks/useAssets', () => ({
      useAssets: () => ({
        balances: [],
        nfts: [],
        loading: false,
        error: 'Failed to fetch assets',
        refresh: jest.fn(),
        startTimers: jest.fn(),
      }),
    }));

    const { getByText } = render(<Wallet />);
    expect(getByText('Failed to fetch assets')).toBeTruthy();
  });
});
