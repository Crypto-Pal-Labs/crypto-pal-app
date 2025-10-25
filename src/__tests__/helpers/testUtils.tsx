import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import WalletProvider from '../../providers/WalletProvider';
import { mockData } from './mockData';

// Custom render function with providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <NavigationContainer>
      <WalletProvider>
        {children}
      </WalletProvider>
    </NavigationContainer>
  );
};

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Mock API responses
export const mockFetch = (response: any, status = 200) => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
    })
  ) as jest.Mock;
};

// Mock AsyncStorage
export const mockAsyncStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
};

// Mock navigation
export const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  reset: jest.fn(),
  setParams: jest.fn(),
  dispatch: jest.fn(),
  canGoBack: jest.fn(() => true),
  isFocused: jest.fn(() => true),
  addListener: jest.fn(),
  removeListener: jest.fn(),
};

// Mock route
export const mockRoute = {
  key: 'test-route',
  name: 'TestScreen',
  params: {},
};

// Test data generators
export const generateMockTransaction = (overrides = {}) => ({
  hash: '0x' + Math.random().toString(16).substr(2, 40),
  timestamp: new Date().toISOString(),
  from: mockData.mockWalletAddresses.main,
  to: mockData.mockWalletAddresses.secondary,
  valueWei: '1000000000000000000',
  successful: true,
  chainId: 80002,
  explorerBase: 'https://amoy.polygonscan.com',
  nativeSymbol: 'MATIC',
  _source: 'rpc',
  isToken: false,
  direction: 'OUT',
  ...overrides,
});

export const generateMockBalance = (overrides = {}) => ({
  contract_ticker_symbol: 'MATIC',
  balance: '1000000000000000000',
  quoteLocal: 0.65,
  quoteUsd: 0.65,
  logo_url: 'https://example.com/matic.png',
  contract_address: undefined,
  contract_decimals: 18,
  contract_name: 'MATIC',
  chainId: 80002,
  ...overrides,
});

// Performance testing utilities
export const measurePerformance = async (fn: () => Promise<any>) => {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return {
    result,
    duration: end - start,
  };
};

// Accessibility testing utilities
export const getAccessibilityProps = (element: any) => ({
  accessible: element.props.accessible,
  accessibilityLabel: element.props.accessibilityLabel,
  accessibilityHint: element.props.accessibilityHint,
  accessibilityRole: element.props.accessibilityRole,
  accessibilityState: element.props.accessibilityState,
});

// Visual testing utilities
export const createScreenshotTest = (name: string, component: React.ReactElement) => {
  return {
    name,
    component,
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
  };
};

// API mocking utilities
export const mockCovalentAPI = () => {
  mockFetch(mockData.mockCovalentResponse);
};

export const mockCoinGeckoAPI = () => {
  mockFetch(mockData.mockCoinGeckoResponse);
};

export const mockExplorerAPI = () => {
  mockFetch(mockData.mockExplorerResponse);
};

export const mockRPCAPI = () => {
  mockFetch(mockData.mockRPCResponse);
};

// Error simulation
export const simulateNetworkError = () => {
  global.fetch = jest.fn(() =>
    Promise.reject(new Error('Network request failed'))
  ) as jest.Mock;
};

export const simulateAPIError = (status = 500, message = 'Internal Server Error') => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({ error: message }),
    })
  ) as jest.Mock;
};

// Wait utilities
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const waitForElement = async (getByTestId: any, testId: string, timeout = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      return getByTestId(testId);
    } catch {
      await waitFor(100);
    }
  }
  throw new Error(`Element with testId "${testId}" not found within ${timeout}ms`);
};

// Re-export everything
export * from '@testing-library/react-native';
export { customRender as render };
