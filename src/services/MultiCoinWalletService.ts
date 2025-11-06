// src/services/MultiCoinWalletService.ts
// Multi-coin wallet service to derive addresses for all supported cryptocurrencies
// from a single mnemonic using BIP44 standard derivation paths

import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
// Lazy import bitcoinjs-lib to avoid React Native bundler issues
import { Buffer } from 'buffer';
import { getMnemonic } from '../utils/wallet';

function isReactNativeEnvironment(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

// BIP44 Derivation Paths:
// Format: m / purpose' / coin_type' / account' / change / address_index
// Standard paths for major coins
const DERIVATION_PATHS = {
  // EVM chains (Ethereum, Polygon, BSC, etc.) - all use same path
  EVM: "m/44'/60'/0'/0/0", // Ethereum standard path
  
  // Bitcoin
  BTC: "m/44'/0'/0'/0/0", // Bitcoin P2PKH (legacy)
  BTC_SEGWIT: "m/44'/0'/0'/0/0", // Bitcoin P2WPKH (native segwit) - uses same path but different encoding
  
  // Solana
  SOL: "m/44'/501'/0'/0'", // Solana uses account-based derivation (no change/address_index)
  
  // Cardano
  ADA: "m/44'/1815'/0'/0/0",
  
  // Stellar
  XLM: "m/44'/148'/0'/0/0",
  
  // Ripple
  XRP: "m/44'/144'/0'/0/0",
  
  // Tron
  TRX: "m/44'/195'/0'/0/0",
  
  // Dogecoin
  DOGE: "m/44'/3'/0'/0/0",
  
  // Litecoin
  LTC: "m/44'/2'/0'/0/0",
  
  // Bitcoin Cash
  BCH: "m/44'/145'/0'/0/0",
  
  // Cosmos
  ATOM: "m/44'/118'/0'/0/0",
  
  // Polkadot
  DOT: "m/44'/354'/0'/0/0",
  
  // Near
  NEAR: "m/44'/397'/0'/0/0",
} as const;

export interface CoinAddress {
  coin: string;
  address: string;
  network?: string; // e.g., 'mainnet', 'testnet'
}

export interface MultiCoinAddresses {
  [coinSymbol: string]: string; // e.g., { BTC: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', ETH: '0x...', SOL: '...' }
}

/**
 * Derive Ethereum (and all EVM-compatible) address from mnemonic
 */
export function deriveEVMAddress(mnemonic: string): string {
  const wallet = ethers.Wallet.fromMnemonic(mnemonic);
  return wallet.address;
}

/**
 * Derive Bitcoin address from mnemonic (P2PKH legacy format)
 * Uses lazy import to avoid loading bitcoinjs-lib until needed
 * Returns empty string if derivation fails (graceful degradation)
 */
export async function deriveBitcoinAddress(mnemonic: string, network?: any): Promise<string> {
  try {
    // Lazy import to avoid loading bitcoinjs-lib dependencies at module load time
    // This prevents React Native bundler issues with Node.js modules
    const bitcoin = await import('bitcoinjs-lib');
    const bitcoinNetwork = network || bitcoin.networks.bitcoin;
    
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const bip32 = BIP32Factory(ecc);
    const root = bip32.fromSeed(seed, bitcoinNetwork);
    const path = DERIVATION_PATHS.BTC;
    const child = root.derivePath(path);
    
    const { address } = bitcoin.payments.p2pkh({
      pubkey: child.publicKey,
      network: bitcoinNetwork,
    });
    
    if (!address) {
      console.warn('Bitcoin address derivation returned null');
      return '';
    }
    return address;
  } catch (error) {
    // Graceful degradation: log error but don't throw - app can still work without BTC support
    console.warn('Bitcoin derivation not available:', error instanceof Error ? error.message : 'Unknown error');
    console.warn('App will continue without Bitcoin address derivation. This is expected if bitcoinjs-lib dependencies fail to load.');
    return ''; // Return empty string instead of throwing
  }
}

/**
 * Derive XRP (Ripple) address from mnemonic
 * XRP uses Ed25519 public key encoded as base58 XRP address
 * BIP44 path: m/44'/144'/0'/0/0
 */
export async function deriveXrpAddress(mnemonic: string): Promise<string> {
  try {
    if (isReactNativeEnvironment()) {
      console.warn('XRP address derivation disabled in React Native environment - relying on Transak-provided address');
      return '';
    }

    // XRP address derivation requires Ed25519 public key
    // We'll use the same approach as Solana but encode differently
    const ed25519HdKey = await import('ed25519-hd-key');
    
    // CRITICAL: Wrap seed conversion in try-catch - bip39 might fail in React Native
    let seed: Buffer | Uint8Array | string;
    try {
      seed = bip39.mnemonicToSeedSync(mnemonic);
    } catch (seedError) {
      console.warn('XRP derivation: bip39.mnemonicToSeedSync failed:', seedError);
      return '';
    }
    
    // Convert seed to hex string (same approach as Solana)
    let seedHex: string;
    if (Buffer.isBuffer(seed)) {
      if (typeof seed.toString === 'function') {
        try {
          seedHex = seed.toString('hex');
        } catch {
          const arr = Array.from(seed as any) as number[];
          seedHex = arr.map((b: number) => b.toString(16).padStart(2, '0')).join('');
        }
      } else {
        const arr = Array.from(seed as any) as number[];
        seedHex = arr.map((b: number) => b.toString(16).padStart(2, '0')).join('');
      }
    } else if ((seed as any) instanceof Uint8Array || (seed && typeof (seed as any).length === 'number' && typeof (seed as any)[0] === 'number')) {
      const seedArr = seed as any;
      const arr = (seedArr instanceof Uint8Array ? Array.from(seedArr) : Array.from(seedArr)) as number[];
      seedHex = arr.map((b: number) => b.toString(16).padStart(2, '0')).join('');
    } else if (typeof seed === 'string') {
      seedHex = seed;
    } else {
      console.warn('XRP derivation: unexpected seed type, skipping');
      return '';
    }
    
    if (!seedHex || typeof seedHex !== 'string' || seedHex.length === 0) {
      console.warn('XRP derivation: invalid seedHex, skipping');
      return '';
    }
    
    // XRP uses Ed25519 with BIP44 path m/44'/144'/0'/0/0
    const derivePath = ed25519HdKey.derivePath || (ed25519HdKey as any).default?.derivePath || (ed25519HdKey as any).derivePath;
    
    if (!derivePath || typeof derivePath !== 'function') {
      console.warn('ed25519-hd-key derivePath not available, XRP derivation skipped');
      return '';
    }
    
    // XRP derivation path: m/44'/144'/0'/0/0
    // Remove "m/" prefix for ed25519-hd-key
    const pathWithoutPrefix = DERIVATION_PATHS.XRP.replace("m/", "");
    
    // CRITICAL: Wrap derivePath call in try-catch - it may throw errors internally (slice issues in polyfills)
    let derivedSeed: any;
    try {
      derivedSeed = derivePath(pathWithoutPrefix, seedHex);
    } catch (deriveError) {
      console.warn('XRP derivation: derivePath threw an error (likely polyfill issue):', deriveError);
      return '';
    }
    
    // CRITICAL: Ensure derivePath returned valid result - if derivedSeed is undefined/null, skip
    if (!derivedSeed) {
      console.warn('XRP derivation: derivePath returned undefined/null');
      return '';
    }
    
    // Get public key (first 32 bytes)
    // CRITICAL: Add null checks before calling slice() to prevent "Cannot read property 'slice' of undefined" errors
    let publicKeyBytes: Buffer | null = null;
    if (typeof derivedSeed === 'object') {
      if ((derivedSeed as any).key !== undefined && (derivedSeed as any).key !== null) {
        const keyVal: any = (derivedSeed as any).key;
        if (keyVal && Buffer.isBuffer(keyVal) && typeof keyVal.slice === 'function') {
          try {
            publicKeyBytes = keyVal.slice(0, 32);
          } catch {
            publicKeyBytes = null;
          }
        } else if (typeof keyVal === 'string') {
          try {
            const buffer = Buffer.from(keyVal, 'hex');
            if (buffer && typeof buffer.slice === 'function') {
              publicKeyBytes = buffer.slice(0, 32);
            } else {
              publicKeyBytes = null;
            }
          } catch {
            publicKeyBytes = null;
          }
        } else if (Array.isArray(keyVal) || (keyVal && typeof keyVal.length === 'number')) {
          try {
            const buffer = Buffer.from(keyVal as ArrayLike<number>);
            if (buffer && typeof buffer.slice === 'function') {
              publicKeyBytes = buffer.slice(0, 32);
            } else {
              publicKeyBytes = null;
            }
          } catch {
            publicKeyBytes = null;
          }
        }
      } else if (derivedSeed && Buffer.isBuffer(derivedSeed as any)) {
        try {
          const buffer = derivedSeed as any;
          if (buffer && typeof buffer.slice === 'function' && buffer.length >= 32) {
            publicKeyBytes = buffer.slice(0, 32);
          } else {
            publicKeyBytes = null;
          }
        } catch {
          publicKeyBytes = null;
        }
      }
    }
    
    if (!publicKeyBytes || publicKeyBytes.length < 32) {
      console.warn('XRP derivation: could not extract public key');
      return '';
    }
    
    // XRP address encoding: Use SHA256 + RIPEMD160 hash of public key, then encode with base58
    // This is a simplified version - full XRP encoding uses account encoding
    // For React Native compatibility, we'll use a simplified approach
    // XRP addresses start with 'r' and are base58 encoded
    
    // CRITICAL: XRP address format requires proper encoding
    // We need to hash the public key and encode it properly
    // For now, return empty string and log - proper XRP encoding requires xrpl-address-codec library
    // which may not be React Native compatible
    
    // FALLBACK: Return empty string - XRP address derivation requires additional library
    // The address will be derived on-demand when needed, or user can provide it
    console.warn('XRP address derivation: Full implementation requires xrpl-address-codec library');
    console.warn('XRP derivation temporarily skipped - address will need to be provided manually or via external service');
    
    return ''; // Return empty for now - will implement full encoding if library available
  } catch (error) {
    console.warn('Failed to derive XRP address:', error);
    // Graceful degradation - app can work without XRP address
    return '';
  }
}

/**
 * Derive Solana address from mnemonic
 * Note: Solana uses Ed25519, requires different library
 */
export async function deriveSolanaAddress(mnemonic: string): Promise<string> {
  try {
    // Dynamic import to avoid loading if not needed
    const ed25519HdKey = await import('ed25519-hd-key');
    const { Keypair } = await import('@solana/web3.js');
    
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    
    // Safely convert seed to hex string (handle React Native Buffer polyfill)
    let seedHex: string;
    if (Buffer.isBuffer(seed)) {
      // Check if toString method exists and works
      if (typeof seed.toString === 'function') {
        try {
          seedHex = seed.toString('hex');
        } catch {
          // Fallback to manual conversion
          const arr = Array.from(seed as any) as number[];
          seedHex = arr
            .map((b: number) => b.toString(16).padStart(2, '0'))
            .join('');
        }
      } else {
        // Manual conversion if toString not available
        const arr = Array.from(seed as any) as number[];
        seedHex = arr
          .map((b: number) => b.toString(16).padStart(2, '0'))
          .join('');
      }
    } else if ((seed as any) instanceof Uint8Array || (seed && typeof (seed as any).length === 'number' && typeof (seed as any)[0] === 'number')) {
      // If it's a Uint8Array or array-like, manually convert to hex
      const seedArr = seed as any;
      const arr = (seedArr instanceof Uint8Array ? Array.from(seedArr) : Array.from(seedArr)) as number[];
      seedHex = arr
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
    } else if (typeof seed === 'string') {
      seedHex = seed;
    } else {
      console.warn('Solana derivation: unexpected seed type, skipping', { seedType: typeof seed, isBuffer: Buffer.isBuffer(seed) });
      return '';
    }
    
    if (!seedHex || typeof seedHex !== 'string' || seedHex.length === 0) {
      console.warn('Solana derivation: invalid seedHex, skipping');
      return '';
    }
    
    // ed25519-hd-key may export derivePath differently - handle both cases
    const derivePath = ed25519HdKey.derivePath || (ed25519HdKey as any).default?.derivePath || (ed25519HdKey as any).derivePath;
    
    if (!derivePath || typeof derivePath !== 'function') {
      console.warn('ed25519-hd-key derivePath not available, Solana derivation skipped');
      return '';
    }
    
    // Solana derivation path format: remove "m/" prefix for ed25519-hd-key
    const pathWithoutPrefix = DERIVATION_PATHS.SOL.replace("m/", "");
    const derivedSeed = derivePath(pathWithoutPrefix, seedHex);
    
    // Handle both { key } object and Buffer/ArrayBuffer directly
    let seedBuffer: Buffer | null = null;
    if (derivedSeed && typeof derivedSeed === 'object') {
      if ((derivedSeed as any).key) {
        const keyVal: any = (derivedSeed as any).key;
        if (Buffer.isBuffer(keyVal)) {
          seedBuffer = keyVal;
        } else if (typeof keyVal === 'string') {
          // If string hex
          try {
            seedBuffer = Buffer.from(keyVal, 'hex');
          } catch {
            seedBuffer = null;
          }
        } else if (Array.isArray(keyVal) || (keyVal && typeof keyVal.length === 'number')) {
          seedBuffer = Buffer.from(keyVal as ArrayLike<number>);
        }
      } else if (Buffer.isBuffer(derivedSeed as any)) {
        seedBuffer = derivedSeed as any;
      }
    }
    
    if (!seedBuffer) {
      // Final fallback: use first 32 bytes of BIP39 seed
      try {
        // Safely convert seedHex to Buffer
        if (!seedHex || typeof seedHex !== 'string' || seedHex.length < 64) {
          throw new Error('Invalid seedHex: too short or not a string');
        }
        
        let seedBytes: Buffer | null = null;
        
        // Check if Buffer.from exists and is a function
        if (typeof Buffer.from !== 'function') {
          throw new Error('Buffer.from is not available');
        }
        
        try {
          seedBytes = Buffer.from(seedHex, 'hex');
          
          // Validate Buffer was created successfully - check if it's actually a Buffer
          if (!seedBytes || seedBytes === undefined || seedBytes === null) {
            throw new Error('Buffer.from returned null/undefined');
          }
          
          // Check if slice method exists
          if (typeof seedBytes.slice !== 'function') {
            throw new Error('Buffer.from returned object without slice method');
          }
          
          // Test slice to ensure it works
          const testSlice = seedBytes.slice(0, 1);
          if (!testSlice || testSlice === undefined) {
            throw new Error('Buffer.slice returned undefined');
          }
        } catch (bufferError) {
          // If Buffer.from fails, try manual conversion
          const bytes: number[] = [];
          for (let i = 0; i < seedHex.length; i += 2) {
            const byteStr = seedHex.substr(i, 2);
            if (byteStr.length !== 2) break;
            const byte = parseInt(byteStr, 16);
            if (isNaN(byte)) {
              throw new Error('Invalid hex string');
            }
            bytes.push(byte);
          }
          
          if (bytes.length === 0) {
            throw new Error('No bytes extracted from hex string');
          }
          
          try {
            seedBytes = Buffer.from(bytes);
            
            // Validate again
            if (!seedBytes || typeof seedBytes.slice !== 'function') {
              throw new Error('Manual Buffer.from also returned invalid result');
            }
          } catch (manualError) {
            throw new Error(`Both Buffer.from methods failed: ${bufferError}, ${manualError}`);
          }
        }
        
        if (seedBytes.length === 0) {
          throw new Error('Empty seed bytes');
        }
        
        seedBuffer = seedBytes.slice(0, 32);
        
        // Final validation
        if (!seedBuffer || typeof seedBuffer.slice !== 'function' || seedBuffer.length < 32) {
          throw new Error('Seed buffer validation failed');
        }
      } catch (error) {
        console.warn('Solana derivation: unable to construct seed buffer, skipping', error);
        return '';
      }
    }
    
    // Final validation before using
    if (!seedBuffer || typeof seedBuffer.slice !== 'function' || seedBuffer.length < 32) {
      console.warn('Solana derivation: seed buffer too short or invalid, skipping');
      return '';
    }
    
    try {
      const keypair = Keypair.fromSeed(seedBuffer.slice(0, 32));
      return keypair.publicKey.toBase58();
    } catch (keypairError) {
      console.warn('Solana derivation: Keypair.fromSeed failed', keypairError);
      return '';
    }
  } catch (error) {
    console.warn('Failed to derive Solana address:', error);
    // Fallback: return empty string if libraries not available
    return '';
  }
}

/**
 * Derive all supported cryptocurrency addresses from mnemonic
 * Returns a map of coin symbols to addresses
 */
export async function deriveAllAddresses(mnemonic: string): Promise<MultiCoinAddresses> {
  const addresses: MultiCoinAddresses = {};
  
  try {
    // EVM addresses (Ethereum, Polygon, BSC, etc. - all use same address)
    const evmAddress = deriveEVMAddress(mnemonic);
    addresses.ETH = evmAddress;
    addresses.MATIC = evmAddress; // Polygon uses Ethereum addresses
    addresses.BNB = evmAddress; // BSC uses Ethereum addresses
    addresses.USDC = evmAddress; // ERC-20 tokens use Ethereum addresses
    addresses.USDT = evmAddress;
    addresses.DAI = evmAddress;
    addresses.FTM = evmAddress; // Fantom uses Ethereum addresses
    addresses.ARB = evmAddress; // Arbitrum uses Ethereum addresses
    addresses.OP = evmAddress; // Optimism uses Ethereum addresses
    addresses.AVAX = evmAddress; // Avalanche C-Chain uses Ethereum addresses
    addresses.BASE = evmAddress; // Base uses Ethereum addresses
    
    // Bitcoin (async, lazy loaded to avoid React Native bundler issues)
    try {
      const btcAddress = await deriveBitcoinAddress(mnemonic);
      if (btcAddress) {
        addresses.BTC = btcAddress;
      }
    } catch (error) {
      console.error('Failed to derive BTC address:', error);
    }
    
    // Solana (async, may fail if libraries not installed or React Native Buffer issues)
    // TEMPORARILY DISABLED due to React Native Buffer polyfill issues causing crashes
    // TODO: Re-enable once Buffer.from() issues in React Native are resolved
    /*
    try {
      // Use Promise.resolve to ensure any errors are caught
      const solAddress = await Promise.resolve(deriveSolanaAddress(mnemonic)).catch(err => {
        console.warn('Solana derivation promise rejected:', err);
        return '';
      });
      if (solAddress && typeof solAddress === 'string' && solAddress.length > 0) {
        addresses.SOL = solAddress;
      }
    } catch (error) {
      // Double-layer catch to ensure we never throw
      console.warn('Failed to derive SOL address (caught in deriveAllAddresses):', error instanceof Error ? error.message : String(error));
      // Continue without SOL address - app can function without it
    }
    */
    // Skip Solana derivation for now to prevent app crashes
    console.log('Solana derivation temporarily disabled due to React Native compatibility issues');
    
    // XRP (Ripple) address derivation
    // NOTE: Full XRP encoding requires xrpl-address-codec which may not be React Native compatible
    // For now, we attempt derivation but may return empty string
    // User can still purchase XRP through Transak - Transak will generate address if needed
    try {
      const xrpAddress = await deriveXrpAddress(mnemonic);
      if (xrpAddress) {
        addresses.XRP = xrpAddress;
      } else {
        // XRP derivation may fail due to encoding library requirements
        // This is OK - Transak can handle XRP purchases without pre-derived addresses
        console.log('XRP address derivation skipped - will use Transak-generated address if needed');
      }
    } catch (error) {
      console.warn('Failed to derive XRP address:', error);
      // Continue - XRP purchases can still work through Transak
    }
    
    // Note: Other coins (XLM, ADA, TRX, etc.) can be added incrementally
    
  } catch (error) {
    console.error('Error deriving addresses:', error);
  }
  
  return addresses;
}

/**
 * Get all wallet addresses for the current wallet
 * This is the main function to call from the app
 */
export async function getAllWalletAddresses(): Promise<MultiCoinAddresses> {
  const mnemonic = await getMnemonic();
  if (!mnemonic) {
    throw new Error('No mnemonic found. Please restore your wallet.');
  }
  
  return await deriveAllAddresses(mnemonic);
}

/**
 * Format addresses for Transak's walletAddressesData parameter
 * Transak expects a specific nested JSON format with "coins" as parent key
 * Official format: {"coins": {"BTC": {"address": "..."}, "ETH": {"address": "..."}}}
 */
export function formatAddressesForTransak(addresses: MultiCoinAddresses): string {
  // Transak requires nested structure: {"coins": {"BTC": {"address": "..."}, ...}}
  // NOT flat structure: {"BTC": "...", "ETH": "..."}
  const coinsObject: Record<string, { address: string }> = {};
  
  Object.keys(addresses).forEach(coinSymbol => {
    if (addresses[coinSymbol]) {
      coinsObject[coinSymbol] = { address: addresses[coinSymbol] };
    }
  });
  
  const transakFormat = { coins: coinsObject };
  return JSON.stringify(transakFormat);
}

/**
 * Get address for a specific coin
 */
export async function getAddressForCoin(coinSymbol: string): Promise<string | null> {
  try {
    const addresses = await getAllWalletAddresses();
    return addresses[coinSymbol.toUpperCase()] || null;
  } catch (error) {
    console.error(`Failed to get address for ${coinSymbol}:`, error);
    return null;
  }
}

