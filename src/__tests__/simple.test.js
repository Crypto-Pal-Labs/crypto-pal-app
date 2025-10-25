// Simple test to demonstrate the testing framework
describe('Crypto Pal Testing Framework', () => {
  it('should demonstrate basic testing functionality', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test string operations', () => {
    const walletAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';
    expect(walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should test array operations', () => {
    const tokens = ['MATIC', 'ETH', 'USDC'];
    expect(tokens).toContain('MATIC');
    expect(tokens).toHaveLength(3);
  });

  it('should test object operations', () => {
    const mockBalance = {
      symbol: 'MATIC',
      balance: '1.5',
      usd: 0.975
    };
    
    expect(mockBalance).toHaveProperty('symbol', 'MATIC');
    expect(mockBalance).toHaveProperty('balance');
    expect(parseFloat(mockBalance.balance)).toBeGreaterThan(0);
  });
});
