import { ethers } from 'ethers';

test('generates valid 12-word mnemonic', () => {
  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic?.phrase; // Null-safe
  expect(mnemonic?.split(' ').length).toBe(12);
});

test('restores wallet from mnemonic', () => {
  const mnemonic = 'test test test test test test test test test test test junk'; // Example phrase
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'); // Corrected match
});