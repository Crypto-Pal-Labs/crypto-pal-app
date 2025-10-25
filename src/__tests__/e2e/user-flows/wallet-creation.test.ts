import { test, expect } from '@playwright/test';

test.describe('Wallet Creation Flow', () => {
  test('should complete full wallet creation process', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Step 1: Welcome screen
    await expect(page.locator('text=Welcome to Crypto Pal')).toBeVisible();
    await page.click('button:has-text("Get Started")');

    // Step 2: Create new wallet
    await expect(page.locator('text=Create New Wallet')).toBeVisible();
    await page.click('button:has-text("Create New Wallet")');

    // Step 3: Set PIN
    await expect(page.locator('text=Set Your PIN')).toBeVisible();
    await page.fill('[data-testid="pin-input"]', '1234');
    await page.fill('[data-testid="confirm-pin-input"]', '1234');
    await page.click('button:has-text("Continue")');

    // Step 4: Enable biometrics (optional)
    await expect(page.locator('text=Enable Biometrics')).toBeVisible();
    await page.click('button:has-text("Skip")');

    // Step 5: Backup mnemonic
    await expect(page.locator('text=Backup Your Wallet')).toBeVisible();
    await page.click('button:has-text("I Understand")');
    
    // Verify mnemonic is displayed
    const mnemonicWords = await page.locator('[data-testid="mnemonic-word"]').allTextContents();
    expect(mnemonicWords).toHaveLength(12);

    // Confirm mnemonic
    await page.click('button:has-text("I\'ve Written It Down")');
    
    // Verify mnemonic words in correct order
    for (let i = 0; i < 3; i++) {
      const word = mnemonicWords[i];
      await page.click(`button:has-text("${word}")`);
    }
    await page.click('button:has-text("Verify")');

    // Step 6: Wallet created successfully
    await expect(page.locator('text=Wallet Created Successfully')).toBeVisible();
    await page.click('button:has-text("Go to Wallet")');

    // Step 7: Verify wallet screen
    await expect(page.locator('text=Wallet Home')).toBeVisible();
    await expect(page.locator('text=All Networks')).toBeVisible();
  });

  test('should handle PIN mismatch error', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Get Started")');
    await page.click('button:has-text("Create New Wallet")');

    // Enter mismatched PINs
    await page.fill('[data-testid="pin-input"]', '1234');
    await page.fill('[data-testid="confirm-pin-input"]', '5678');
    await page.click('button:has-text("Continue")');

    // Should show error message
    await expect(page.locator('text=PINs do not match')).toBeVisible();
  });

  test('should handle biometric setup', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Get Started")');
    await page.click('button:has-text("Create New Wallet")');

    // Set PIN
    await page.fill('[data-testid="pin-input"]', '1234');
    await page.fill('[data-testid="confirm-pin-input"]', '1234');
    await page.click('button:has-text("Continue")');

    // Enable biometrics
    await page.click('button:has-text("Enable Biometrics")');
    
    // Mock biometric setup
    await page.evaluate(() => {
      // Simulate biometric setup success
      window.localStorage.setItem('biometricsEnabled', 'true');
    });

    await expect(page.locator('text=Biometrics Enabled')).toBeVisible();
  });

  test('should handle mnemonic verification failure', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Get Started")');
    await page.click('button:has-text("Create New Wallet")');

    // Set PIN
    await page.fill('[data-testid="pin-input"]', '1234');
    await page.fill('[data-testid="confirm-pin-input"]', '1234');
    await page.click('button:has-text("Continue")');

    // Skip biometrics
    await page.click('button:has-text("Skip")');

    // Backup mnemonic
    await page.click('button:has-text("I Understand")');
    await page.click('button:has-text("I\'ve Written It Down")');

    // Enter wrong words
    await page.click('button:has-text("wrong")');
    await page.click('button:has-text("words")');
    await page.click('button:has-text("order")');
    await page.click('button:has-text("Verify")');

    // Should show error
    await expect(page.locator('text=Incorrect word order')).toBeVisible();
  });
});
