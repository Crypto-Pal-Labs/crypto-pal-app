# 🧪 Crypto Pal Comprehensive Test Suite

This directory contains a comprehensive testing framework for the Crypto Pal app, covering unit tests, integration tests, visual tests, E2E tests, and performance tests.

## 📁 Directory Structure

```
src/__tests__/
├── unit/                    # Unit tests for individual functions
│   ├── utils/              # Utility function tests
│   ├── lib/                # Library function tests
│   └── services/           # Service function tests
├── integration/            # Integration tests
│   ├── hooks/              # React hook tests
│   ├── screens/            # Screen component tests
│   └── store/              # State management tests
├── visual/                 # Visual and UI tests
│   ├── screenshots/         # Screenshot testing
│   ├── components/         # Component visual tests
│   └── responsive/         # Responsive design tests
├── e2e/                    # End-to-end tests
│   ├── user-flows/         # Complete user workflows
│   ├── cross-platform/     # Platform-specific tests
│   └── accessibility/      # Accessibility tests
├── api/                    # API integration tests
├── performance/            # Performance and load tests
└── helpers/                # Test utilities and mock data
```

## 🚀 Quick Start

### Run All Tests
```bash
npm run test
```

### Run Specific Test Types
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Visual tests only
npm run test:visual

# E2E tests only
npm run test:e2e

# Performance tests only
npm run test:performance

# API tests only
npm run test:api
```

### Development Mode
```bash
# Watch mode for unit tests
npm run test:watch

# Storybook for component development
npm run storybook
```

## 📊 Test Reports

All test results are automatically generated with timestamps in the `test-results/` directory:

- **HTML Report**: `test-results/reports/test-report-YYYY-MM-DD-HHmmss.html`
- **JSON Report**: `test-results/reports/test-report-YYYY-MM-DD-HHmmss.json`
- **Coverage Report**: `test-results/coverage/`
- **Screenshots**: `test-results/screenshots/`
- **Videos**: `test-results/videos/`

## 🧪 Test Categories

### 1. Unit Tests
Test individual functions and utilities in isolation.

**Examples:**
- `wallet.test.ts` - Wallet utility functions
- `covalent.test.ts` - Covalent API wrapper
- `eth.test.ts` - Ethereum utilities

### 2. Integration Tests
Test component interactions and hooks.

**Examples:**
- `useAssets.test.ts` - Asset management hook
- `useHistory.test.ts` - Transaction history hook
- `Wallet.test.tsx` - Wallet screen integration

### 3. Visual Tests
Test UI components and visual regression.

**Examples:**
- `Wallet.test.tsx` - Wallet screen visual tests
- `HistoryTab.test.tsx` - History tab visual tests
- Screenshot comparison tests

### 4. E2E Tests
Test complete user workflows.

**Examples:**
- `wallet-creation.test.ts` - Full wallet creation flow
- `send-transaction.test.ts` - Send transaction workflow
- `buy-crypto.test.ts` - Buy crypto workflow

### 5. Performance Tests
Test performance and load times.

**Examples:**
- `asset-loading.test.ts` - Asset loading performance
- `transaction-history.test.ts` - History loading performance
- Memory usage tests

### 6. API Tests
Test external API integrations.

**Examples:**
- `covalent.api.test.ts` - Covalent API reliability
- `coingecko.api.test.ts` - CoinGecko API tests
- `rpc.api.test.ts` - RPC provider tests

## 🛠️ Writing Tests

### Unit Test Example
```typescript
import { getWalletAddress } from '../../../utils/wallet';
import { mockAsyncStorage } from '../../helpers/testUtils';

describe('getWalletAddress', () => {
  it('should return wallet address from storage', async () => {
    const mockAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';
    mockAsyncStorage.getItem.mockResolvedValue(mockAddress);

    const result = await getWalletAddress();

    expect(result).toBe(mockAddress);
  });
});
```

### Integration Test Example
```typescript
import { renderHook, waitFor } from '@testing-library/react-native';
import { useAssets } from '../../../hooks/useAssets';

describe('useAssets Hook', () => {
  it('should fetch and return assets', async () => {
    const { result } = renderHook(() => useAssets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.balances).toBeDefined();
  });
});
```

### E2E Test Example
```typescript
import { test, expect } from '@playwright/test';

test('should complete wallet creation', async ({ page }) => {
  await page.goto('/');
  await page.click('button:has-text("Get Started")');
  await page.click('button:has-text("Create New Wallet")');
  
  // ... rest of the flow
});
```

## 🔧 Configuration

### Jest Configuration
Located in `test-config/jest.config.js`

### Playwright Configuration
Located in `test-config/playwright.config.ts`

### Storybook Configuration
Located in `test-config/storybook.config.js`

## 📈 Coverage Goals

- **Unit Tests**: 90%+ coverage
- **Integration Tests**: 80%+ coverage
- **E2E Tests**: All critical user flows
- **Visual Tests**: All UI components
- **Performance Tests**: All performance-critical features

## 🐛 Debugging Tests

### Debug Unit Tests
```bash
npm run test:unit -- --verbose
```

### Debug E2E Tests
```bash
npx playwright test --debug
```

### Debug Visual Tests
```bash
npm run test:visual -- --verbose
```

## 📝 Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Dependencies**: Use mocks for APIs and storage
3. **Clear Test Names**: Use descriptive test names
4. **Arrange-Act-Assert**: Structure tests clearly
5. **Test Edge Cases**: Include error scenarios
6. **Performance Awareness**: Monitor test execution time
7. **Visual Consistency**: Use screenshot testing for UI changes

## 🚨 Troubleshooting

### Common Issues

1. **AsyncStorage Mock Issues**
   - Ensure mocks are properly set up in `setupTests.ts`

2. **Navigation Mock Issues**
   - Use the provided navigation mocks in `testUtils.tsx`

3. **API Mock Issues**
   - Check that fetch is properly mocked
   - Verify API response formats

4. **Performance Test Failures**
   - Adjust timeout values if needed
   - Check for memory leaks

### Getting Help

- Check the test logs for detailed error messages
- Review the generated HTML reports
- Ensure all dependencies are installed
- Verify configuration files are correct

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-native-testing-library/intro)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Storybook Documentation](https://storybook.js.org/docs/react/get-started/introduction)
