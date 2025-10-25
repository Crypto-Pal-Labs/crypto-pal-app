// Mock data for comprehensive testing

export const mockWalletAddresses = {
  main: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
  secondary: '0x8ba1f109551bD432803012645Hac136c',
  test: '0x1234567890123456789012345678901234567890',
};

export const mockChains = [
  {
    chainId: 80002,
    name: 'Polygon Amoy',
    shortName: 'Polygon · Amoy',
    covalentChainId: 'matic-amoy',
    rpcUrls: ['https://rpc-amoy.polygon.technology'],
    explorerBase: 'https://amoy.polygonscan.com',
    nativeSymbol: 'MATIC',
    decimals: 18,
    testnet: true,
    covalentSupported: false,
  },
  {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    shortName: 'Ethereum · Sepolia',
    covalentChainId: 'eth-sepolia',
    rpcUrls: ['https://sepolia.infura.io/v3/test'],
    explorerBase: 'https://sepolia.etherscan.io',
    nativeSymbol: 'ETH',
    decimals: 18,
    testnet: true,
    covalentSupported: true,
  },
];

export const mockBalanceItems = [
  {
    contract_ticker_symbol: 'MATIC',
    balance: '1500000000000000000', // 1.5 MATIC
    quoteLocal: 0.975, // $0.975
    quoteUsd: 0.975,
    logo_url: 'https://example.com/matic.png',
    contract_address: undefined,
    contract_decimals: 18,
    contract_name: 'MATIC',
    chainId: 80002,
  },
  {
    contract_ticker_symbol: 'ETH',
    balance: '1000000000000000000', // 1 ETH
    quoteLocal: 2000,
    quoteUsd: 2000,
    logo_url: 'https://example.com/eth.png',
    contract_address: undefined,
    contract_decimals: 18,
    contract_name: 'Ethereum',
    chainId: 11155111,
  },
  {
    contract_ticker_symbol: 'USDC',
    balance: '100000000', // 100 USDC (6 decimals)
    quoteLocal: 100,
    quoteUsd: 100,
    logo_url: 'https://example.com/usdc.png',
    contract_address: '0xA0b86a33E6441b8C4C8C0d4F0e4d4F0e4d4F0e4d',
    contract_decimals: 6,
    contract_name: 'USD Coin',
    chainId: 80002,
  },
];

export const mockTransactions = [
  {
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    timestamp: '2024-01-15T10:30:00.000Z',
    from: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    to: '0x8ba1f109551bD432803012645Hac136c',
    valueWei: '1000000000000000000', // 1 ETH
    successful: true,
    chainId: 11155111,
    explorerBase: 'https://sepolia.etherscan.io',
    nativeSymbol: 'ETH',
    _source: 'rpc',
    isToken: false,
    direction: 'OUT',
  },
  {
    hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    timestamp: '2024-01-15T09:15:00.000Z',
    from: '0x8ba1f109551bD432803012645Hac136c',
    to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    valueWei: '500000000000000000', // 0.5 ETH
    successful: true,
    chainId: 11155111,
    explorerBase: 'https://sepolia.etherscan.io',
    nativeSymbol: 'ETH',
    _source: 'rpc',
    isToken: false,
    direction: 'IN',
  },
  {
    hash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
    timestamp: '2024-01-15T08:45:00.000Z',
    from: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    to: '0x8ba1f109551bD432803012645Hac136c',
    valueWei: '2000000000000000000', // 2 MATIC
    successful: true,
    chainId: 80002,
    explorerBase: 'https://amoy.polygonscan.com',
    nativeSymbol: 'MATIC',
    _source: 'rpc',
    isToken: false,
    direction: 'OUT',
  },
];

export const mockCovalentResponse = {
  data: {
    items: [
      {
        contract_ticker_symbol: 'MATIC',
        balance: '1500000000000000000',
        logo_url: 'https://example.com/matic.png',
        contract_address: null,
        contract_decimals: 18,
        contract_name: 'MATIC',
        type: 'cryptocurrency',
      },
    ],
  },
  error: false,
  error_message: null,
  error_code: null,
};

export const mockCoinGeckoResponse = {
  ethereum: {
    usd: 2000,
    eur: 1800,
  },
  'matic-network': {
    usd: 0.65,
    eur: 0.58,
  },
  'usd-coin': {
    usd: 1.0,
    eur: 0.9,
  },
};

export const mockExplorerResponse = {
  status: '1',
  message: 'OK',
  result: [
    {
      blockNumber: '12345678',
      timeStamp: '1705312200',
      hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      from: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      to: '0x8ba1f109551bD432803012645Hac136c',
      value: '1000000000000000000',
      gas: '21000',
      gasPrice: '20000000000',
      isError: '0',
      txreceipt_status: '1',
    },
  ],
};

export const mockRPCResponse = {
  jsonrpc: '2.0',
  id: 1,
  result: '0x1234567890abcdef',
};

export const mockUserInteractions = {
  walletCreation: {
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    password: 'testPassword123',
    pin: '1234',
  },
  sendTransaction: {
    to: '0x8ba1f109551bD432803012645Hac136c',
    amount: '0.5',
    gasPrice: '20000000000',
    gasLimit: '21000',
  },
  buyCrypto: {
    amount: '100',
    currency: 'USD',
    paymentMethod: 'credit_card',
  },
};

export const mockErrorResponses = {
  networkError: {
    message: 'Network request failed',
    code: 'NETWORK_ERROR',
  },
  apiError: {
    message: 'API rate limit exceeded',
    code: 'RATE_LIMIT',
    status: 429,
  },
  validationError: {
    message: 'Invalid wallet address',
    code: 'VALIDATION_ERROR',
  },
};

export const mockPerformanceMetrics = {
  loadTime: 1500, // ms
  memoryUsage: 50, // MB
  apiResponseTime: 800, // ms
  renderTime: 200, // ms
};

export const mockAccessibilityData = {
  screenReader: {
    announcements: [
      'Wallet balance updated',
      'Transaction sent successfully',
      'Network switched to Polygon Amoy',
    ],
    labels: [
      'Balance: 1.5 MATIC',
      'Send button',
      'Network selector',
    ],
  },
  keyboardNavigation: {
    tabOrder: [
      'network-picker',
      'currency-picker',
      'search-input',
      'balance-list',
      'send-button',
    ],
  },
};

export const mockData = {
  mockWalletAddresses,
  mockChains,
  mockBalanceItems,
  mockTransactions,
  mockCovalentResponse,
  mockCoinGeckoResponse,
  mockExplorerResponse,
  mockRPCResponse,
  mockUserInteractions,
  mockErrorResponses,
  mockPerformanceMetrics,
  mockAccessibilityData,
};
