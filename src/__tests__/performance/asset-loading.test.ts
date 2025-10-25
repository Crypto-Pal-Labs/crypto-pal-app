import { test, expect } from '@playwright/test';

test.describe('Asset Loading Performance', () => {
  test('should load assets within acceptable time', async ({ page }) => {
    // Start performance measurement
    await page.goto('/wallet');
    
    // Wait for assets to load
    await page.waitForSelector('[data-testid="balance-item"]', { timeout: 10000 });
    
    // Measure performance metrics
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
      };
    });

    // Assert performance thresholds
    expect(metrics.loadTime).toBeLessThan(3000); // 3 seconds
    expect(metrics.domContentLoaded).toBeLessThan(2000); // 2 seconds
    expect(metrics.firstPaint).toBeLessThan(1500); // 1.5 seconds
    expect(metrics.firstContentfulPaint).toBeLessThan(2000); // 2 seconds
  });

  test('should handle large asset lists efficiently', async ({ page }) => {
    // Mock large asset list
    await page.route('**/api/covalenthq.com/**', async route => {
      const mockResponse = {
        data: {
          items: Array.from({ length: 100 }, (_, i) => ({
            contract_ticker_symbol: `TOKEN${i}`,
            balance: '1000000000000000000',
            logo_url: 'https://example.com/token.png',
            contract_address: `0x${i.toString(16).padStart(40, '0')}`,
            contract_decimals: 18,
            contract_name: `Token ${i}`,
          })),
        },
      };
      await route.fulfill({ json: mockResponse });
    });

    await page.goto('/wallet');
    
    // Measure rendering time for large list
    const startTime = Date.now();
    await page.waitForSelector('[data-testid="balance-item"]:nth-child(50)');
    const endTime = Date.now();
    
    const renderTime = endTime - startTime;
    expect(renderTime).toBeLessThan(5000); // 5 seconds for 100 items
  });

  test('should handle network switching performance', async ({ page }) => {
    await page.goto('/wallet');
    await page.waitForSelector('[data-testid="balance-item"]');

    // Measure network switching time
    const startTime = Date.now();
    await page.click('[data-testid="network-picker"]');
    await page.selectOption('[data-testid="network-picker"]', '11155111'); // Ethereum Sepolia
    await page.waitForSelector('[data-testid="balance-item"]');
    const endTime = Date.now();

    const switchTime = endTime - startTime;
    expect(switchTime).toBeLessThan(2000); // 2 seconds for network switch
  });

  test('should handle refresh performance', async ({ page }) => {
    await page.goto('/wallet');
    await page.waitForSelector('[data-testid="balance-item"]');

    // Measure refresh time
    const startTime = Date.now();
    await page.click('[data-testid="refresh-button"]');
    await page.waitForSelector('[data-testid="balance-item"]');
    const endTime = Date.now();

    const refreshTime = endTime - startTime;
    expect(refreshTime).toBeLessThan(3000); // 3 seconds for refresh
  });

  test('should handle search performance', async ({ page }) => {
    await page.goto('/wallet');
    await page.waitForSelector('[data-testid="balance-item"]');

    // Measure search performance
    const startTime = Date.now();
    await page.fill('[data-testid="search-input"]', 'MATIC');
    await page.waitForSelector('[data-testid="balance-item"]:has-text("MATIC")');
    const endTime = Date.now();

    const searchTime = endTime - startTime;
    expect(searchTime).toBeLessThan(1000); // 1 second for search
  });

  test('should handle memory usage efficiently', async ({ page }) => {
    await page.goto('/wallet');
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    // Perform multiple operations
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="refresh-button"]');
      await page.waitForSelector('[data-testid="balance-item"]');
    }

    // Get final memory usage
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    const memoryIncrease = finalMemory - initialMemory;
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB increase max
  });
});
