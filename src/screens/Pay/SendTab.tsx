// src/screens/Pay/SendTab.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, Alert, StyleSheet,
  ActivityIndicator, TouchableOpacity, Modal, Linking, ScrollView, RefreshControl
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ethers from 'ethers';
import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';
import * as Clipboard from 'expo-clipboard';

import { useWalletStore } from '../../store/useWalletStore';
import { useChain } from '../../hooks/useChain';
import { CHAINS, EvmChain } from '../../config/chainRegistry';
import { covalentGet } from '../../lib/covalent';
import { useAssets } from '../../hooks/useAssetsSimplified';

type AssetChoice = {
  key: string;                 // `${chainId}:${isNative ? 'native' : contract}`
  chainId: number;
  chain: EvmChain;
  isNative: boolean;
  contract?: string;
  symbol: string;
  name: string;
  decimals: number;
  balanceWei: string;
  balanceFormatted: string;
};

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const CHAIN_FEE_FLOORS: Record<number, { minPriorityGwei: number; minGasGwei: number }> = {
  80002: { minPriorityGwei: 30, minGasGwei: 30 }, // Polygon Amoy
  137:   { minPriorityGwei: 30, minGasGwei: 30 }, // Polygon
};
const DEFAULT_MIN_PRIORITY_GWEI = 2;
const DEFAULT_MIN_GAS_GWEI = 2;

// REMOVED: Fixed gas prices - use real-time gas estimation only
// const FALLBACK_GAS_LIMIT_NATIVE = ethers.BigNumber.from(65000);
// const FALLBACK_GAS_LIMIT_ERC20  = ethers.BigNumber.from(90000);
// const FALLBACK_GAS_PRICE        = ethers.utils.parseUnits('2', 'gwei');

const FEE_TIMEOUT_MS = 1500;
const MAX_FETCH_MS  = 6500;
const SOFT_FETCH_MS = 3500;

const ASSET_INDEX_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ASSET_INDEX_KEY = (addr: string) => `assetIndex_v1:${addr.toLowerCase()}`;
const INVALIDATE_KEY  = (addr: string, cid: number) => `assetsInvalidate:${addr.toLowerCase()}:${cid}`;

// Native symbol → CoinGecko id
const CG_IDS: Record<'ETH' | 'BNB' | 'MATIC' | 'AVAX' | 'ARB' | 'OP' | 'BASE', string> = {
  ETH: 'ethereum',
  BNB: 'binancecoin',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  ARB: 'arbitrum',
  OP: 'optimism',
  BASE: 'base',
};
// Native symbol → CoinPaprika id
const PAPRIKA_IDS: Record<'ETH' | 'BNB' | 'MATIC' | 'AVAX' | 'ARB' | 'OP' | 'BASE', string> = {
  ETH: 'eth-ethereum',
  BNB: 'bnb-binance-coin',
  MATIC: 'matic-polygon',
  AVAX: 'avax-avalanche',
  ARB: 'arb-arbitrum',
  OP: 'op-optimism',
  BASE: 'base-base',
};

// Optional CG API keys (demo or pro)
const CG_DEMO = (process.env.EXPO_PUBLIC_COINGECKO_API_KEY || '').trim();
const CG_PRO  = (process.env.EXPO_PUBLIC_COINGECKO_PRO_API_KEY || '').trim();

// Real-time gas price estimation with RPC error handling and timeout protection
const getRealTimeGasPrice = async (provider: ethers.providers.Provider, chainId?: number): Promise<ethers.BigNumber> => {
  try {
    // CRITICAL: Wrap RPC calls with timeout to prevent 120s waits
    const feeData = await withTimeout(provider.getFeeData(), FEE_TIMEOUT_MS, async () => {
      throw new Error('getFeeData timeout');
    });
    if (feeData.gasPrice) {
      return feeData.gasPrice;
    }
    // If no gas price, estimate from recent blocks
    const blockNumber = await withTimeout(provider.getBlockNumber(), FEE_TIMEOUT_MS, async () => {
      throw new Error('getBlockNumber timeout');
    });
    const block = await withTimeout(provider.getBlock(blockNumber - 1), FEE_TIMEOUT_MS, async () => {
      throw new Error('getBlock timeout');
    });
    if (block && block.baseFeePerGas) {
      return block.baseFeePerGas.mul(2); // 2x base fee as gas price
    }
    throw new Error('No gas price data available');
  } catch (error: any) {
    // Don't log as error if it's a timeout/RPC error - we handle it with fallback
    const isRpcError = error?.code === 'SERVER_ERROR' || 
                       error?.code === 'TIMEOUT' || 
                       error?.status === 522 || 
                       error?.message?.includes('522') ||
                       error?.message?.includes('timeout');
    
    if (isRpcError) {
      // Log as warning, not error - this is expected behavior when RPC is slow
      console.warn('RPC error/timeout detected, using fallback gas price');
      
      // Fallback gas prices by chain (in gwei)
      const fallbackPrices: Record<number, ethers.BigNumber> = {
        1: ethers.utils.parseUnits('30', 'gwei'), // Ethereum Mainnet
        11155111: ethers.utils.parseUnits('1', 'gwei'), // Sepolia
        137: ethers.utils.parseUnits('30', 'gwei'), // Polygon
        80002: ethers.utils.parseUnits('1', 'gwei'), // Polygon Amoy
        56: ethers.utils.parseUnits('3', 'gwei'), // BSC
        97: ethers.utils.parseUnits('1', 'gwei'), // BSC Testnet
      };
      
      const fallbackPrice = fallbackPrices[chainId || 11155111] || ethers.utils.parseUnits('2', 'gwei');
      console.log(`✅ Using fallback gas price: ${ethers.utils.formatUnits(fallbackPrice, 'gwei')} gwei for chainId ${chainId || 11155111}`);
      return fallbackPrice;
    }
    
    // Only log unexpected errors
    console.error('Failed to get real-time gas price (unexpected error):', error);
    throw error;
  }
};

// Real-time gas limit estimation with RPC error handling and timeout protection
const getRealTimeGasLimit = async (
  provider: ethers.providers.Provider,
  transaction: any,
  chainId?: number
): Promise<ethers.BigNumber> => {
  try {
    // CRITICAL: Wrap RPC call with timeout to prevent 120s waits
    // Our timeout (1.5s) should trigger before ethers.js internal timeout (120s)
    return await withTimeout(provider.estimateGas(transaction), FEE_TIMEOUT_MS, async () => {
      throw new Error('estimateGas timeout');
    });
  } catch (error: any) {
    // Don't log as error if it's a timeout/RPC error - we handle it with fallback
    // Only log as error if it's an unexpected error
    const isRpcError = error?.code === 'SERVER_ERROR' || 
                       error?.code === 'TIMEOUT' || 
                       error?.status === 522 || 
                       error?.message?.includes('522') ||
                       error?.message?.includes('timeout');
    
    if (isRpcError) {
      // Log as warning, not error - this is expected behavior when RPC is slow
      console.warn('RPC error/timeout detected in gas estimation, using fallback gas limit');
      
      // Fallback gas limits by transaction type
      const isNative = !transaction.data || transaction.data === '0x';
      const fallbackLimits: Record<number, { native: ethers.BigNumber; erc20: ethers.BigNumber }> = {
        1: { native: ethers.BigNumber.from(21000), erc20: ethers.BigNumber.from(65000) }, // Ethereum Mainnet
        11155111: { native: ethers.BigNumber.from(21000), erc20: ethers.BigNumber.from(65000) }, // Sepolia
        137: { native: ethers.BigNumber.from(21000), erc20: ethers.BigNumber.from(65000) }, // Polygon
        80002: { native: ethers.BigNumber.from(21000), erc20: ethers.BigNumber.from(65000) }, // Polygon Amoy
        56: { native: ethers.BigNumber.from(21000), erc20: ethers.BigNumber.from(65000) }, // BSC
        97: { native: ethers.BigNumber.from(21000), erc20: ethers.BigNumber.from(65000) }, // BSC Testnet
      };
      
      const fallback = fallbackLimits[chainId || 11155111] || { native: ethers.BigNumber.from(21000), erc20: ethers.BigNumber.from(65000) };
      const fallbackLimit = isNative ? fallback.native : fallback.erc20;
      console.log(`✅ Using fallback gas limit: ${fallbackLimit.toString()} for ${isNative ? 'native' : 'ERC-20'} transaction on chainId ${chainId || 11155111}`);
      return fallbackLimit;
    }
    
    // Only log unexpected errors
    console.error('Failed to estimate gas limit (unexpected error):', error);
    throw error;
  }
};

const gwei = (n: number) => ethers.utils.parseUnits(String(n), 'gwei');

const maskAddr = (a: string) =>
  a?.startsWith('0x') && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
const fmt = (n: number, dp = 6) =>
  Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/, '').replace(/\.$/, '') : '—';

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(async () => { 
      if (onTimeout) {
        try {
          const result = await onTimeout();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      } else {
        reject(new Error('timeout'));
      }
    }, ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

function parseDeepError(e: any): string {
  const tryBodies = [e?.error?.body, e?.body];
  for (const b of tryBodies) {
    if (typeof b === 'string') {
      try { const j = JSON.parse(b); const m = j?.error?.message || j?.message; if (m) return String(m); }
      catch {}
    }
  }
  return (e?.reason || e?.error?.message || e?.data?.message || e?.message || String(e));
}

/* ----------------------- Price helpers (robust) ----------------------- */
async function getNativeUsdPrice(sym: 'ETH'|'BNB'|'MATIC'|'AVAX'|'ARB'|'OP'|'BASE'): Promise<number> {
  const id = CG_IDS[sym];
  try {
    const base = CG_PRO ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
    const url = `${base}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd${
      CG_DEMO && !CG_PRO ? `&x_cg_demo_api_key=${encodeURIComponent(CG_DEMO)}` : ''
    }`;
    const headers: Record<string,string> = { Accept: 'application/json' };
    if (CG_PRO) headers['x-cg-pro-api-key'] = CG_PRO;
    else if (CG_DEMO) headers['x-cg-demo-api-key'] = CG_DEMO;

    const r = await withTimeout(fetch(url, { headers }), 8500);
    if (r.ok) {
      const j = await r.json();
      const v = Number(j?.[id]?.usd);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch {}
  // Paprika fallback
  try {
    const pid = PAPRIKA_IDS[sym];
    const r = await withTimeout(
      fetch(`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(pid)}?quotes=USD`,
        { headers: { Accept: 'application/json' } }),
      8500
    );
    if (r.ok) {
      const j = await r.json();
      const v = Number(j?.quotes?.USD?.price);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch {}
  return 0;
}

async function getUsdToLocal(localCode: string): Promise<number> {
  const code = (localCode || 'USD').toUpperCase();
  if (code === 'USD') return 1;
  try {
    const url = `https://api.coinpaprika.com/v1/tickers/usdt-tether?quotes=USD,${encodeURIComponent(code)}`;
    const r = await withTimeout(fetch(url, { headers: { Accept: 'application/json' } }), 8500);
    if (r.ok) {
      const j = await r.json();
      const v = Number(j?.quotes?.[code]?.price);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch {}
  return 1;
}

/* ---------------- Confirmation text (ONLY entered unit + single equivalent) ---------------- */
function confirmSummary(opts: {
  enteredAmount: string;
  unit: 'token' | 'usd' | 'local';
  assetSymbol: string;
  isNative: boolean;
  valueBN: ethers.BigNumber;
  nativePriceUSD: number;
  usdToLocal: number;
  localCode: string;
  feeEstimate: string;
  chainLabel: string;
  toMasked: string;
  nativeSymbol: 'ETH' | 'BNB' | 'MATIC' | 'AVAX' | 'ARB' | 'OP' | 'BASE';
  decimals?: number;
}) {
  const {
    enteredAmount, unit, assetSymbol, isNative, valueBN,
    nativePriceUSD, usdToLocal, localCode, feeEstimate,
    chainLabel, toMasked, nativeSymbol, decimals = 18
  } = opts;

  const tokenQty = isNative
    ? parseFloat(ethers.utils.formatEther(valueBN))
    : parseFloat(ethers.utils.formatUnits(valueBN, decimals));

  const enteredLine =
    unit === 'token'
      ? `${enteredAmount} ${isNative ? nativeSymbol : assetSymbol}`
      : unit === 'usd'
      ? `$${fmt(parseFloat(enteredAmount), 2)} USD`
      : `${fmt(parseFloat(enteredAmount), 2)} ${localCode}`;

  let equivalentLine = '—';
  if (isNative) {
    if (unit === 'token') {
      const usd = tokenQty * (nativePriceUSD || 0);
      equivalentLine = `≈ $${fmt(usd, 2)} USD`;
    } else {
      let usdAmount = parseFloat(enteredAmount) || 0;
      if (unit === 'local') usdAmount = usdAmount / (usdToLocal || 1);
      const tokens = (nativePriceUSD > 0) ? (usdAmount / nativePriceUSD) : 0;
      equivalentLine = `≈ ${fmt(tokens)} ${nativeSymbol}`;
    }
  } else {
    equivalentLine = '—';
  }

  const feeLine = isNative ? feeEstimate : `${feeEstimate} (paid in ${nativeSymbol})`;

  return [
    'Transactions are not reversible.',
    '',
    `You entered: ${enteredLine}`,
    `Equivalent: ${equivalentLine}`,
    `Network: ${chainLabel}`,
    `To: ${toMasked}`,
    `Estimated network fee: ${feeLine}`,
  ].join('\n');
}

const SendTab = () => {
  const { address: fromAddress } = useWalletStore();
  const { chain: defaultChain } = useChain();
  const { balances: walletBalances } = useAssets(); // Get balances from Wallet tab hook

  // QR
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Form
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [busyStage, setBusyStage] = useState<null | 'preparing' | 'fee' | 'submitting'>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Units (native only)
  const [amountUnit, setAmountUnit] = useState<'token' | 'usd' | 'local'>('token');

  // Prices (native only)
  const deviceCurrencyCode = Localization.getLocales()?.[0]?.currencyCode || 'USD';
  const localCode = deviceCurrencyCode.toUpperCase();
  const [nativePriceUSD, setNativePriceUSD] = useState(0);
  const [usdToLocal, setUsdToLocal] = useState(1);

  // Assets (owned across chains)
  const [assetOptions, setAssetOptions] = useState<AssetChoice[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const selectedAsset = useMemo(
    () => assetOptions.find(a => a.key === selectedKey) || null,
    [assetOptions, selectedKey]
  );

  // Fee preview
  const [feeEstimate, setFeeEstimate] = useState('Enter details');

  // Convenience derived values
  const activeChain: EvmChain | null = useMemo(
    () => selectedAsset?.chain || defaultChain,
    [selectedAsset, defaultChain]
  );

  const floors = useMemo(() => {
    if (!activeChain) return {
      minPriorityGwei: DEFAULT_MIN_PRIORITY_GWEI,
      minGasGwei: DEFAULT_MIN_GAS_GWEI,
    };
    
    const cid = activeChain.chainId;
    return CHAIN_FEE_FLOORS[cid] || {
      minPriorityGwei: DEFAULT_MIN_PRIORITY_GWEI,
      minGasGwei: DEFAULT_MIN_GAS_GWEI, // ✅ correct key
    };
  }, [activeChain?.chainId]);

  const RPC_URL = activeChain?.rpcUrls[0] || '';
  const EXPLORER_BASE = activeChain?.explorerBase || '';
  const NATIVE_SYMBOL = (activeChain?.nativeSymbol || 'ETH') as 'ETH'|'BNB'|'MATIC'|'AVAX'|'ARB'|'OP'|'BASE';
  const MIN_TIP = gwei(floors.minPriorityGwei);
  const MIN_GAS = gwei(floors.minGasGwei || DEFAULT_MIN_GAS_GWEI); // ✅ correct key

  const makeProvider = () => {
    if (!activeChain) return null;
    // CRITICAL: Set shorter timeout to prevent 120s waits
    // ethers.js default is 120s, but we want to fail fast and use fallback
    const provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL, { 
      chainId: activeChain.chainId, 
      name: activeChain.name 
    });
    // Override provider's connection timeout to match our FEE_TIMEOUT_MS
    // This prevents ethers.js from waiting 120s before timing out
    if (provider.connection) {
      // @ts-ignore - connection may not be exposed but we try
      if (provider.connection.timeout !== undefined) {
        // @ts-ignore
        provider.connection.timeout = FEE_TIMEOUT_MS;
      }
    }
    return provider;
  };

  const getSigner = async () => {
    const mnemonic = await SecureStore.getItemAsync('mnemonic');
    if (!mnemonic) throw new Error('No mnemonic found—cannot sign transaction.');
    const wallet = ethers.Wallet.fromMnemonic(mnemonic);
    const provider = makeProvider();
    if (!provider) throw new Error('No provider available for current chain.');
    return wallet.connect(provider);
  };

  const normalizeAddress = (raw: string) => {
    const t = raw.trim();
    return /^[0-9a-fA-F]{40}$/.test(t) ? `0x${t}` : t;
  };
  const isValidAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

  // ───────────── Asset Index ─────────────
  const loadAssetIndex = useCallback(async (owner: string): Promise<AssetChoice[]> => {
    try {
      const raw = await AsyncStorage.getItem(ASSET_INDEX_KEY(owner));
      if (raw) {
        const { at, list } = JSON.parse(raw);
        if (Date.now() - (at || 0) < ASSET_INDEX_TTL_MS && Array.isArray(list)) {
          return list as AssetChoice[];
        }
      }
    } catch {}

    const out: AssetChoice[] = [];
    const essentialChains = [1, 11155111, 80002, 137, 56, 42161, 10, 97, 8453]; // Main chains + testnets

    // Build a map of balances from Wallet tab (most accurate source)
    // CRITICAL: Always check walletBalances, but don't rely on it being populated
    // Some phones may have delayed/empty walletBalances, so we'll use RPC fallback
    const walletBalanceMap = new Map<string, { balance: string; decimals: number }>();
    if (walletBalances && walletBalances.length > 0) {
      walletBalances.forEach(b => {
        if (!b.contract_address) {
          // Native token: use chainId + 'native' as key
          const key = `${b.chainId}:native`;
          walletBalanceMap.set(key, { 
            balance: b.balance || '0', 
            decimals: b.contract_decimals || 18 
          });
        } else {
          // ERC-20 token: use chainId + contract address as key
          const key = `${b.chainId}:${b.contract_address.toLowerCase()}`;
          walletBalanceMap.set(key, { 
            balance: b.balance || '0', 
            decimals: b.contract_decimals || 18 
          });
        }
      });
    }

    await Promise.allSettled(CHAINS.map(async (c) => {
      // Track if we should include native token for this chain
      let nativeIncluded = false;
      let nativeBalance = ethers.constants.Zero;
      let hasTokensOnChain = false;

      // Get native balance from Wallet tab balances (more accurate than RPC)
      const nativeKey = `${c.chainId}:native`;
      const walletNativeBalance = walletBalanceMap.get(nativeKey);
      
      if (walletNativeBalance) {
        nativeBalance = ethers.BigNumber.from(walletNativeBalance.balance);
        const hasBalance = !nativeBalance.isZero();
        
        // CRITICAL: Include native token even if balance is 0 (for visibility)
        // Users should see all assets they hold, including newly purchased tokens
        out.push({
          key: nativeKey,
          chainId: c.chainId, chain: c, isNative: true,
          symbol: c.nativeSymbol, name: `${c.nativeSymbol} on ${c.shortName || c.name}`,
          decimals: 18, 
          balanceWei: nativeBalance.toString(), 
          balanceFormatted: ethers.utils.formatEther(nativeBalance),
        });
        nativeIncluded = true;
      }
      
      // CRITICAL: Always try RPC fallback for native tokens (even if walletBalances has it)
      // This ensures ETH shows up on all phones, even if walletBalances is delayed/empty on some devices
      if (!nativeIncluded) {
        try {
          const provider = new ethers.providers.StaticJsonRpcProvider(c.rpcUrls[0], { chainId: c.chainId, name: c.name });
          nativeBalance = await withTimeout(provider.getBalance(owner), SOFT_FETCH_MS, () => ethers.constants.Zero);
          // CRITICAL: Include native token even if balance is 0 (for visibility)
          // Check if already added (might have been added from walletBalances)
          if (!out.find(a => a.key === nativeKey)) {
            out.push({
              key: nativeKey,
              chainId: c.chainId, chain: c, isNative: true,
              symbol: c.nativeSymbol, name: `${c.nativeSymbol} on ${c.shortName || c.name}`,
              decimals: 18, 
              balanceWei: nativeBalance.toString(), 
              balanceFormatted: ethers.utils.formatEther(nativeBalance),
            });
            nativeIncluded = true;
          }
        } catch (err) {
          // Silent failure - don't include native token if we can't fetch balance
        }
      }

      // ERC-20 tokens: Get from Wallet balances - Include ALL tokens (even with 0 balance)
      // This ensures users can see all assets they hold, including BUY transactions
      walletBalances.forEach(wb => {
        if (wb.chainId === c.chainId && wb.contract_address) {
          const contract = wb.contract_address.toLowerCase();
          const key = `${c.chainId}:${contract}`;
          
          // Check if already added
          if (!out.find(a => a.key === key)) {
            const balanceWei = ethers.BigNumber.from(wb.balance || '0');
            // CRITICAL: Include ALL tokens from Wallet tab, even if balance is 0
            // This allows users to see all assets they hold, including newly purchased tokens
            hasTokensOnChain = true;
            out.push({
              key,
              chainId: c.chainId, chain: c, isNative: false, contract,
              symbol: wb.contract_ticker_symbol || 'TOKEN',
              name: `${wb.contract_name || wb.contract_ticker_symbol || 'TOKEN'} on ${c.shortName || c.name}`,
              decimals: wb.contract_decimals || 18,
              balanceWei: wb.balance || '0',
              balanceFormatted: ethers.utils.formatUnits(wb.balance || '0', wb.contract_decimals || 18),
            });
          }
        }
      });
      
      // Fallback: ERC-20 via Covalent (for tokens not in Wallet balances yet)
      try {
        const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/balances_v2/?quote-currency=USD&nft=false&no-nft-fetch=true`;
        const json = await withTimeout(covalentGet(url), MAX_FETCH_MS, () => ({ data: { items: [] } } as any));
        const items: any[] = (json as any)?.data?.items || [];
        for (const it of items) {
          const contract = String(it?.contract_address || '').toLowerCase();
          if (!contract || contract === '0x0000000000000000000000000000000000000000' || contract === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') continue;
          
          // Skip if already added from Wallet balances
          const key = `${c.chainId}:${contract}`;
          if (out.find(a => a.key === key)) continue;
          
          const decimals = Number(it?.contract_decimals ?? 18);
          const symbol = String(it?.contract_ticker_symbol || '').toUpperCase() || 'TOKEN';
          const name = String(it?.contract_name || symbol);
          const balStr = String(it?.balance || '0');
          if (!ethers.BigNumber.from(balStr || '0').gt(0)) continue;
          
          hasTokensOnChain = true;

          out.push({
            key,
            chainId: c.chainId, chain: c, isNative: false, contract,
            symbol, name, decimals: Number.isFinite(decimals) ? decimals : 18,
            balanceWei: balStr,
            balanceFormatted: ethers.utils.formatUnits(balStr, Number.isFinite(decimals) ? decimals : 18),
          });
        }
      } catch {}
      
      // Only include native token if it has positive balance (required for P2P sending)
      // Removed: No longer including native tokens with 0 balance
    }));

    // CRITICAL: Include ALL tokens from Wallet tab, even if balance is 0
    // This ensures users can see all assets they hold, including newly purchased tokens
    // DO NOT filter by balance - show all assets from Wallet tab
    // Sort: by chain, then by symbol
    out.sort((a, b) => {
      // First by chain
      if (a.chainId !== b.chainId) return a.chainId - b.chainId;
      // Then by symbol
      return a.symbol.localeCompare(b.symbol);
    });
    try { await AsyncStorage.setItem(ASSET_INDEX_KEY(owner), JSON.stringify({ at: Date.now(), list: out })); } catch {}
    return out;
  }, [walletBalances]); // Re-fetch when wallet balances update

  // Track wallet balances changes with a ref to avoid unnecessary re-renders
  const walletBalancesRef = useRef<string>('');
  useEffect(() => {
    // Create a stable key from wallet balances to detect actual changes
    const balanceKey = walletBalances.map(b => `${b.chainId}:${b.contract_address || 'native'}:${b.balance}`).join('|');
    if (walletBalancesRef.current === balanceKey) return; // No change
    walletBalancesRef.current = balanceKey;
    
    (async () => {
      if (!fromAddress) return;
      // Reload asset index when walletBalances change (to get updated balances)
      const list = await loadAssetIndex(fromAddress);
      setAssetOptions(list);
      
      // Select first asset with balance, or default to first available
      const firstWithBalance = list.find(a => ethers.BigNumber.from(a.balanceWei || '0').gt(0));
      const firstKey = firstWithBalance?.key || (list.length > 0 ? list[0].key : `${defaultChain?.chainId || 1}:native`);
      setSelectedKey(firstKey);
    })();
  }, [fromAddress, loadAssetIndex, defaultChain?.chainId, walletBalances, walletBalances.length]); // Re-run when wallet balances change

  // Rates for native (robust)
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const p = await getNativeUsdPrice(NATIVE_SYMBOL);
        setNativePriceUSD(p || 0);
      } catch { setNativePriceUSD(0); }
      try {
        const rate = await getUsdToLocal(localCode);
        setUsdToLocal(rate || 1);
      } catch { setUsdToLocal(1); }
    };
    fetchRates();
  }, [NATIVE_SYMBOL, localCode]);

  // Fee preview
  useEffect(() => {
    const candidate = normalizeAddress(toAddress);
    if (!selectedAsset) { setFeeEstimate('Select an asset'); return; }
    if (!candidate || !amount) { setFeeEstimate('Enter details'); return; }
    if (!isValidAddress(candidate)) { setFeeEstimate('Invalid recipient'); return; }

    (async () => {
      const provider = makeProvider();
      if (!provider) {
        setFeeEstimate('No provider available');
        return;
      }
      
      try {
        
        const fd = await withTimeout(provider.getFeeData(), FEE_TIMEOUT_MS, async () => {
          const gasPrice = await getRealTimeGasPrice(provider, activeChain?.chainId);
          return { 
            gasPrice, 
            maxFeePerGas: null, 
            maxPriorityFeePerGas: null,
            lastBaseFeePerGas: null
          };
        });

        let gasLim: ethers.BigNumber;
        if (selectedAsset.isNative) {
          // CRITICAL: Use getRealTimeGasLimit directly - it has timeout protection and fallback
          // This prevents ethers.js from waiting 120s before our timeout wrapper kicks in
          const value = parseAmountToWei(amount, selectedAsset, amountUnit, nativePriceUSD, usdToLocal);
          gasLim = await getRealTimeGasLimit(provider, { to: candidate, value }, activeChain?.chainId);
        } else {
          const signer = (ethers.Wallet.createRandom()).connect(provider);
          const contract = new ethers.Contract(selectedAsset.contract!, ERC20_ABI, signer);
          const value = ethers.utils.parseUnits(amount || '0', selectedAsset.decimals || 18);
          // CRITICAL: Use getRealTimeGasLimit directly - it has timeout protection and fallback
          gasLim = await getRealTimeGasLimit(provider, {
            to: selectedAsset.contract,
            data: contract.interface.encodeFunctionData('transfer', [candidate, value])
          }, activeChain?.chainId);
        }

        let perGas: ethers.BigNumber;
        if (fd.maxFeePerGas && fd.maxPriorityFeePerGas) {
          let tip = fd.maxPriorityFeePerGas;
          if (tip.lt(MIN_TIP)) tip = MIN_TIP;
          let maxFee = fd.maxFeePerGas;
          const floorMax = tip.mul(2).add(ethers.utils.parseUnits('20', 'gwei'));
          if (maxFee.lt(floorMax)) maxFee = floorMax;
          perGas = maxFee;
        } else {
          let gp = fd.gasPrice ?? await getRealTimeGasPrice(provider, activeChain?.chainId);
          if (gp.lt(MIN_GAS)) gp = MIN_GAS;
          perGas = gp;
        }

        const feeNative = parseFloat(ethers.utils.formatEther(gasLim.mul(perGas)));
        console.log(`SendTab: Fee estimate calculated: ~${fmt(feeNative)} ${NATIVE_SYMBOL} (gasLimit: ${gasLim}, gasPrice: ${perGas})`);
        setFeeEstimate(`~${fmt(feeNative)} ${NATIVE_SYMBOL}`);
      } catch {
        // Use real-time gas estimation instead of fallback
        try {
          const gl = selectedAsset.isNative 
            ? await getRealTimeGasLimit(provider, { to: candidate, value: parseAmountToWei(amount, selectedAsset, amountUnit, nativePriceUSD, usdToLocal) }, activeChain?.chainId)
            : await getRealTimeGasLimit(provider, { to: selectedAsset.contract, data: '0x' }, activeChain?.chainId);
          const feeNative = parseFloat(ethers.utils.formatEther(gl.mul(MIN_GAS)));
          console.log(`SendTab: Fee estimate fallback calculated: ~${fmt(feeNative)} ${NATIVE_SYMBOL} (gasLimit: ${gl}, gasPrice: ${MIN_GAS})`);
          setFeeEstimate(`~${fmt(feeNative)} ${NATIVE_SYMBOL}`);
        } catch {
          setFeeEstimate('Unable to estimate fee');
        }
      }
    })();
  }, [toAddress, amount, amountUnit, selectedAsset, NATIVE_SYMBOL, nativePriceUSD, usdToLocal, MIN_GAS, MIN_TIP]);

  function parseAmountToWei(
    input: string,
    asset: AssetChoice,
    unit: 'token'|'usd'|'local',
    priceUSD: number,
    usdToLocalRate: number
  ): ethers.BigNumber {
    if (!asset.isNative) return ethers.utils.parseUnits(input || '0', asset.decimals || 18);
    const num = parseFloat(input) || 0;
    let tokenAmount = 0;
    if (unit === 'token') tokenAmount = num;
    if (unit === 'usd')   tokenAmount = priceUSD > 0 ? (num / priceUSD) : 0;
    if (unit === 'local') tokenAmount = (priceUSD > 0 && usdToLocalRate > 0) ? (num / (priceUSD * usdToLocalRate)) : 0;
    return ethers.utils.parseEther(tokenAmount.toFixed(18));
  }

  // QR
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    const candidate = normalizeAddress(data);
    setScanned(true); setShowScanner(false);
    if (isValidAddress(candidate)) setToAddress(candidate);
    else Alert.alert('Invalid QR', 'Not a valid address.');
  };

  // SEND
  const handleSend = async () => {
    const candidate = normalizeAddress(toAddress);
    if (!selectedAsset) return Alert.alert('Error', 'Select an asset to send');
    if (!candidate || !amount) return Alert.alert('Error', 'Enter address and amount');
    if (!isValidAddress(candidate)) return Alert.alert('Error', 'Invalid recipient address');
    if (!selectedAsset.isNative && amountUnit !== 'token') {
      return Alert.alert('Amount unit', 'ERC-20 transfers use token units only.');
    }

    setBusyStage('preparing');
    await new Promise(r => setTimeout(r, 100));

    try {
      const signer = await getSigner();
      const provider = signer.provider!;
      const valueBN = parseAmountToWei(amount, selectedAsset, amountUnit, nativePriceUSD, usdToLocal);

      // Fee overrides
      setBusyStage('fee');
      const fd = await withTimeout(provider.getFeeData(), FEE_TIMEOUT_MS, async () => ({
        gasPrice: await getRealTimeGasPrice(provider, activeChain?.chainId), maxFeePerGas: null, maxPriorityFeePerGas: null,
      } as any));
      let overrides: any = {};
      if (fd.maxFeePerGas && fd.maxPriorityFeePerGas) {
        let tip = fd.maxPriorityFeePerGas; if (tip.lt(MIN_TIP)) tip = MIN_TIP;
        let maxFee = fd.maxFeePerGas; const floorMax = tip.mul(2).add(ethers.utils.parseUnits('20','gwei')); if (maxFee.lt(floorMax)) maxFee = floorMax;
        overrides.maxPriorityFeePerGas = tip; overrides.maxFeePerGas = maxFee;
      } else {
        let gp = fd.gasPrice ?? await getRealTimeGasPrice(provider, activeChain?.chainId); if (gp.lt(MIN_GAS)) gp = MIN_GAS;
        overrides.gasPrice = gp;
      }

      let txHash = '';
      let effectiveFeeNative = 0;

      if (selectedAsset.isNative) {
        // CRITICAL: Use getRealTimeGasLimit directly - it has timeout protection and fallback
        // This prevents ethers.js from waiting 120s before our timeout wrapper kicks in
        const gasLim = await getRealTimeGasLimit(provider, { to: candidate, value: valueBN }, activeChain?.chainId);
        overrides.gasLimit = gasLim;

        // CRITICAL: Ensure feeEstimate is available before showing Alert
        // If feeEstimate is not set, calculate it now
        let finalFeeEstimate = feeEstimate;
        if (!finalFeeEstimate || finalFeeEstimate === 'Enter details' || finalFeeEstimate === 'Select an asset') {
          // Calculate fee now if not available
          try {
            // Calculate perGas from overrides
            let perGasVal: ethers.BigNumber;
            if (overrides.maxFeePerGas) {
              perGasVal = overrides.maxFeePerGas;
            } else if (overrides.gasPrice) {
              perGasVal = overrides.gasPrice;
            } else {
              perGasVal = MIN_GAS;
            }
            const feeNative = parseFloat(ethers.utils.formatEther(gasLim.mul(perGasVal)));
            finalFeeEstimate = `~${fmt(feeNative)} ${NATIVE_SYMBOL}`;
          } catch {
            finalFeeEstimate = 'Calculating...';
          }
        }
        
        const summary = confirmSummary({
          enteredAmount: amount,
          unit: amountUnit,
          assetSymbol: NATIVE_SYMBOL,
          isNative: true,
          valueBN,
          nativePriceUSD,
          usdToLocal,
          localCode,
          feeEstimate: finalFeeEstimate,
          chainLabel: activeChain?.shortName || activeChain?.name || 'Unknown',
          toMasked: maskAddr(candidate),
          nativeSymbol: NATIVE_SYMBOL,
        });

        setBusyStage(null);
        Alert.alert(
          'Confirm Send',
          summary,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setBusyStage(null) },
            {
              text: 'Continue',
              onPress: async () => {
                try {
                  setBusyStage('submitting');
                  // CRITICAL: Add timeout protection to transaction submission
                  // Wrap sendTransaction with timeout to prevent indefinite spinning
                  const tx = await withTimeout(
                    signer.sendTransaction({ to: candidate, value: valueBN, ...overrides }),
                    MAX_FETCH_MS,
                    async () => {
                      throw new Error('Transaction submission timeout - please try again');
                    }
                  );
                  // CRITICAL: Also timeout the receipt wait
                  const receipt = await withTimeout(
                    tx.wait(1) as Promise<ethers.providers.TransactionReceipt>,
                    MAX_FETCH_MS * 2, // Receipt wait can take longer
                    async () => {
                      throw new Error('Transaction receipt timeout - transaction may still be pending');
                    }
                  ) as ethers.providers.TransactionReceipt;
                  txHash = receipt.transactionHash;
                  effectiveFeeNative = parseFloat(ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice)));

                  await afterSuccessUpdateCaches(fromAddress!, selectedAsset, valueBN, effectiveFeeNative, txHash, candidate, true, activeChain || defaultChain || CHAINS[0], EXPLORER_BASE, NATIVE_SYMBOL);
                  
                  // CRITICAL: Save SEND transaction to TransactionStore (unified transaction management)
                  // This ensures SEND transactions appear in History tab and affect net balance
                  try {
                    const { useTransactionStore } = await import('../../store/useTransactionStore');
                    const transactionStore = useTransactionStore.getState();
                    
                    // CRITICAL: Calculate USD and local currency amounts at time of transaction
                    // This ensures History tab can display correct currency amounts when toggling
                    let usdAmount = '0';
                    let localCurrencyAmount = '0';
                    let currencySymbol = 'USD';
                    
                    if (selectedAsset.isNative) {
                      // Native token: use nativePriceUSD
                      const tokenAmount = parseFloat(ethers.utils.formatEther(valueBN));
                      usdAmount = (tokenAmount * nativePriceUSD).toFixed(2);
                      localCurrencyAmount = (tokenAmount * nativePriceUSD * usdToLocal).toFixed(2);
                      currencySymbol = localCode;
                    } else {
                      // ERC-20 token: fetch price from PriceService
                      try {
                        const { priceService } = await import('../../services/PriceService');
                        const prices = await priceService.getPrices([selectedAsset.symbol], localCode);
                        const tokenPrice = prices[selectedAsset.symbol.toUpperCase()];
                        if (tokenPrice) {
                          const tokenAmount = parseFloat(ethers.utils.formatUnits(valueBN, selectedAsset.decimals));
                          usdAmount = (tokenAmount * tokenPrice.usd).toFixed(2);
                          localCurrencyAmount = (tokenAmount * tokenPrice.local).toFixed(2);
                          currencySymbol = localCode;
                        }
                      } catch (priceError) {
                        console.warn('SendTab: Could not fetch token price for currency conversion:', priceError);
                      }
                    }
                    
                    const sendTransactionData = {
                      type: 'SEND' as const,
                      timestamp: Date.now(),
                      date: new Date().toLocaleDateString(),
                      time: new Date().toLocaleTimeString(),
                      tokenSymbol: selectedAsset.symbol,
                      tokenName: selectedAsset.symbol, // Use symbol, not name (name includes network)
                      tokenAmount: ethers.utils.formatUnits(valueBN, selectedAsset.decimals),
                      tokenDecimals: selectedAsset.decimals,
                      currencySymbol: currencySymbol,
                      currencyAmount: usdAmount, // CRITICAL: Store USD amount for USD toggle (formatAmount calculates from price for display)
                      // NOTE: localCurrencyAmount available via currencySymbol + price calculation for LOCAL toggle
                      fromAddress: fromAddress,
                      toAddress: candidate,
                      transactionHash: txHash,
                      chainId: activeChain?.chainId || defaultChain?.chainId || 11155111,
                      networkName: activeChain?.name || defaultChain?.name || 'Unknown',
                      gasFee: effectiveFeeNative.toString(),
                      totalCost: effectiveFeeNative.toString(),
                      status: 'COMPLETED' as const,
                      reference: txHash.substring(0, 16),
                      source: 'P2P' as const,
                      explorerUrl: `${EXPLORER_BASE}/tx/${txHash}`,
                      walletAddress: fromAddress,
                    };
                    
                    await transactionStore.addTransaction(sendTransactionData, fromAddress);
                    console.log('SendTab: ✅ SEND transaction (native) saved to TransactionStore:', {
                      hash: txHash,
                      amount: sendTransactionData.tokenAmount,
                      token: selectedAsset.symbol,
                      currencyAmount: localCurrencyAmount,
                      currency: currencySymbol,
                      to: candidate.substring(0, 10) + '...'
                    });
                  } catch (error) {
                    console.error('SendTab: ❌ Error saving SEND transaction to TransactionStore:', error);
                    // Don't fail the send - transaction was successful on blockchain
                  }
                } catch (e: any) { onSendError(e); }
              },
            },
          ]
        );
        return;
      }

      // ERC-20 transfer — confirmation
      // Calculate gas limit and fee data first
      const signerErc20 = await getSigner();
      const providerErc20 = signerErc20.provider!;
      const contractForEstimate = new ethers.Contract(selectedAsset.contract!, ERC20_ABI, signerErc20);
      const valueErc20 = ethers.utils.parseUnits(amount || '0', selectedAsset.decimals || 18);
      const gasLimErc20 = await getRealTimeGasLimit(providerErc20, {
        to: selectedAsset.contract,
        data: contractForEstimate.interface.encodeFunctionData('transfer', [candidate, valueErc20])
      }, activeChain?.chainId);
      
      // Get fee data
      const fdErc20 = await withTimeout(providerErc20.getFeeData(), FEE_TIMEOUT_MS, async () => {
        const gasPrice = await getRealTimeGasPrice(providerErc20, activeChain?.chainId);
        return { 
          gasPrice, 
          maxFeePerGas: null, 
          maxPriorityFeePerGas: null,
          lastBaseFeePerGas: null
        };
      });
      
      let perGasErc20: ethers.BigNumber;
      if (fdErc20.maxFeePerGas && fdErc20.maxPriorityFeePerGas) {
        let tip = fdErc20.maxPriorityFeePerGas;
        if (tip.lt(MIN_TIP)) tip = MIN_TIP;
        let maxFee = fdErc20.maxFeePerGas;
        const floorMax = tip.mul(2).add(ethers.utils.parseUnits('20', 'gwei'));
        if (maxFee.lt(floorMax)) maxFee = floorMax;
        perGasErc20 = maxFee;
      } else {
        let gp = fdErc20.gasPrice ?? await getRealTimeGasPrice(providerErc20, activeChain?.chainId);
        if (gp.lt(MIN_GAS)) gp = MIN_GAS;
        perGasErc20 = gp;
      }
      
      // CRITICAL: Ensure feeEstimate is available before showing Alert
      let finalFeeEstimateErc20 = feeEstimate;
      if (!finalFeeEstimateErc20 || finalFeeEstimateErc20 === 'Enter details' || finalFeeEstimateErc20 === 'Select an asset') {
        // Calculate fee now if not available
        try {
          const feeNative = parseFloat(ethers.utils.formatEther(gasLimErc20.mul(perGasErc20)));
          finalFeeEstimateErc20 = `~${fmt(feeNative)} ${NATIVE_SYMBOL}`;
        } catch {
          finalFeeEstimateErc20 = 'Calculating...';
        }
      }
      
      const summaryErc20 = confirmSummary({
          enteredAmount: amount,
          unit: 'token',
          assetSymbol: selectedAsset.symbol,
          isNative: false,
          valueBN,
          nativePriceUSD,
          usdToLocal,
          localCode,
          feeEstimate: finalFeeEstimateErc20,
          chainLabel: activeChain?.shortName || activeChain?.name || 'Unknown',
          toMasked: maskAddr(candidate),
          nativeSymbol: NATIVE_SYMBOL,
          decimals: selectedAsset.decimals || 18,
      });

      setBusyStage(null);
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Confirm Send',
          summaryErc20,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue', onPress: () => resolve(true) },
          ]
        );
      });
      if (!proceed) return;

      setBusyStage('submitting');
      const contract = new ethers.Contract(selectedAsset.contract!, ERC20_ABI, signer);
      // CRITICAL: Use getRealTimeGasLimit directly - it has timeout protection and fallback
      // This prevents ethers.js from waiting 120s before our timeout wrapper kicks in
      const gasLim = await getRealTimeGasLimit(provider, {
        to: selectedAsset.contract,
        data: contract.interface.encodeFunctionData('transfer', [candidate, valueBN])
      }, activeChain?.chainId);
      // CRITICAL: Add timeout protection to transaction submission
      const txPromise = contract.transfer(candidate, valueBN, { ...overrides, gasLimit: gasLim });
      const tx = await withTimeout(
        txPromise,
        MAX_FETCH_MS,
        async () => {
          throw new Error('Transaction submission timeout - please try again');
        }
      ) as ethers.providers.TransactionResponse;
      // CRITICAL: Also timeout the receipt wait
      const receiptPromise = tx.wait(1);
      const receipt = await withTimeout(
        receiptPromise,
        MAX_FETCH_MS * 2, // Receipt wait can take longer
        async () => {
          throw new Error('Transaction receipt timeout - transaction may still be pending');
        }
      ) as ethers.providers.TransactionReceipt;
      txHash = receipt.transactionHash;
      effectiveFeeNative = parseFloat(ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice)));

      await afterSuccessUpdateCaches(fromAddress!, selectedAsset, valueBN, effectiveFeeNative, txHash, candidate, false, activeChain || defaultChain || CHAINS[0], EXPLORER_BASE, NATIVE_SYMBOL);
      
      // CRITICAL: Save SEND transaction to TransactionStore (unified transaction management)
      // This ensures SEND transactions appear in History tab and affect net balance
      try {
        const { useTransactionStore } = await import('../../store/useTransactionStore');
        const transactionStore = useTransactionStore.getState();
        
                    // CRITICAL FIX: Calculate USD and local currency amounts at time of transaction
                    // This ensures History tab can display correct currency amounts when toggling
                    // CRITICAL: Store BOTH USD and local currency amounts for proper toggle display
                    let usdAmount = '0';
                    let localCurrencyAmount = '0';
                    let currencySymbol = localCode; // Use local currency as primary symbol
                    
                    // ERC-20 token: fetch price from PriceService
                    try {
                      const { priceService } = await import('../../services/PriceService');
                      const prices = await priceService.getPrices([selectedAsset.symbol], localCode);
                      const tokenPrice = prices[selectedAsset.symbol.toUpperCase()];
                      if (tokenPrice) {
                        const tokenAmount = parseFloat(ethers.utils.formatUnits(valueBN, selectedAsset.decimals));
                        usdAmount = (tokenAmount * tokenPrice.usd).toFixed(2);
                        localCurrencyAmount = (tokenAmount * tokenPrice.local).toFixed(2);
                        currencySymbol = localCode;
                        console.log('SendTab: Currency conversion:', {
                          tokenAmount,
                          usdAmount,
                          localCurrencyAmount,
                          currencySymbol,
                          usdPrice: tokenPrice.usd,
                          localPrice: tokenPrice.local
                        });
                      }
                    } catch (priceError) {
                      console.warn('SendTab: Could not fetch token price for currency conversion:', priceError);
                    }
                    
                    const sendTransactionData = {
                      type: 'SEND' as const,
                      timestamp: Date.now(),
                      date: new Date().toLocaleDateString(),
                      time: new Date().toLocaleTimeString(),
                      tokenSymbol: selectedAsset.symbol,
                      tokenName: selectedAsset.symbol, // Use symbol, not name (name includes network)
                      tokenAmount: ethers.utils.formatUnits(valueBN, selectedAsset.decimals),
                      tokenDecimals: selectedAsset.decimals,
                      currencySymbol: currencySymbol,
                      // CRITICAL FIX: Store local currency amount (not USD) for proper LOCAL toggle display
                      // formatAmount will use this for LOCAL toggle, and calculate USD from price for USD toggle
                      currencyAmount: localCurrencyAmount, // Store local currency amount (recorded at transaction time)
                      // CRITICAL: Also store USD amount in a separate field for USD toggle
                      ...(usdAmount !== '0' ? { usdAmount: usdAmount } : {}), // Store USD amount separately
                      fromAddress: fromAddress,
                      toAddress: candidate,
                      transactionHash: txHash,
                      chainId: activeChain?.chainId || defaultChain?.chainId || 11155111,
                      networkName: activeChain?.name || defaultChain?.name || 'Unknown',
                      gasFee: effectiveFeeNative.toString(),
                      totalCost: effectiveFeeNative.toString(),
                      status: 'COMPLETED' as const,
                      reference: txHash.substring(0, 16),
                      source: 'P2P' as const,
                      explorerUrl: `${EXPLORER_BASE}/tx/${txHash}`,
                      walletAddress: fromAddress,
                    };
        
        await transactionStore.addTransaction(sendTransactionData, fromAddress);
        console.log('SendTab: ✅ SEND transaction (ERC-20) saved to TransactionStore:', {
          hash: txHash,
          amount: sendTransactionData.tokenAmount,
          token: selectedAsset.symbol,
          currencyAmount: localCurrencyAmount,
          currency: currencySymbol,
          to: candidate.substring(0, 10) + '...'
        });
      } catch (error) {
        console.error('SendTab: ❌ Error saving SEND transaction to TransactionStore:', error);
        // Don't fail the send - transaction was successful on blockchain
      }
    } catch (e: any) { onSendError(e); }
  };

  async function afterSuccessUpdateCaches(
    owner: string,
    asset: AssetChoice,
    valueBN: ethers.BigNumber,
    feeNative: number,
    txHash: string,
    to: string,
    isNative: boolean,
    activeChain: EvmChain,
    EXPLORER_BASE: string,
    NATIVE_SYMBOL: 'ETH'|'BNB'|'MATIC'|'AVAX'|'ARB'|'OP'|'BASE'
  ) {
    setBusyStage(null);

    const localTx = {
      hash: txHash,
      from: owner,
      to,
      value: isNative ? valueBN.toString() : '0',
      timestamp: new Date().toISOString(),
      isSend: true,
      feeNative,
      chainId: activeChain?.chainId || 1,
    };
    const lst = JSON.parse((await AsyncStorage.getItem('localTxs')) || '[]');
    lst.push(localTx);
    await AsyncStorage.setItem('localTxs', JSON.stringify(lst));

    await AsyncStorage.setItem(INVALIDATE_KEY(owner, activeChain?.chainId || 1), String(Date.now()));

    try {
      if (isNative) {
        const prev = parseFloat((await AsyncStorage.getItem('localBalanceDelta')) || '0');
        const sentAndFee = parseFloat(ethers.utils.formatEther(valueBN)) + (feeNative || 0);
        await AsyncStorage.setItem('localBalanceDelta', String(prev - sentAndFee));
      }
    } catch {}

    try {
      const key = ASSET_INDEX_KEY(owner);
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list: AssetChoice[] = parsed?.list || [];
        const idx = list.findIndex(a => a.key === asset.key);
        if (idx >= 0) {
          let cur = ethers.BigNumber.from(list[idx].balanceWei || '0');
          if (isNative) {
            cur = cur.sub(valueBN).sub(ethers.utils.parseEther(String(feeNative)));
          } else {
            cur = cur.sub(valueBN);
          }
          if (cur.lt(0)) cur = ethers.constants.Zero;
          list[idx].balanceWei = cur.toString();
          list[idx].balanceFormatted = asset.isNative
            ? ethers.utils.formatEther(cur)
            : ethers.utils.formatUnits(cur, asset.decimals || 18);
          await AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), list }));
          setAssetOptions(list.slice());
        }
      }
    } catch {}

    const explorerUrl = `${EXPLORER_BASE}/tx/${txHash}`;
    const sentText = isNative
      ? `${fmt(parseFloat(ethers.utils.formatEther(valueBN)))} ${NATIVE_SYMBOL}`
      : `${fmt(parseFloat(ethers.utils.formatUnits(valueBN, asset.decimals)))} ${asset.symbol}`;

    Alert.alert(
      'SUCCESS',
      [
        `Sent on ${activeChain?.shortName || activeChain?.name || 'Unknown'}`,
        `Asset: ${asset.symbol}`,
        `Amount: ${sentText}`,
        `To: ${maskAddr(to)}`,
        `Fee: ${feeNative.toFixed(6)} ${NATIVE_SYMBOL}`,
        `Hash: ${txHash.slice(0, 10)}…${txHash.slice(-8)}`,
      ].join('\n'),
      [
        { text: 'Open Explorer', onPress: () => Linking.openURL(explorerUrl) },
        { text: 'Copy hash', onPress: () => Clipboard.setStringAsync(txHash) },
        { text: 'OK' },
      ]
    );

    setToAddress('');
    setAmount('');
    setAmountUnit('token');
    setFeeEstimate('Enter details');

    loadAssetIndex(owner).then(setAssetOptions).catch(() => {});
  }

  function onSendError(e: any) {
    setBusyStage(null);
    const msg = parseDeepError(e).toLowerCase();
    const errorStr = parseDeepError(e);
    
    // CRITICAL: Handle "Bad response" errors (RPC failures, 522 errors, etc.)
    if (msg.includes('bad response') || msg.includes('status=522') || msg.includes('timeout') || e?.code === 'SERVER_ERROR' || e?.code === 'TIMEOUT') {
      Alert.alert(
        'Network Error',
        'The transaction could not be submitted due to a network issue. The transaction may still be pending. Please check your transaction history or try again later.',
        [
          { text: 'OK', style: 'default' }
        ]
      );
      console.warn('SendTab: Network error during transaction submission:', {
        error: errorStr,
        code: e?.code,
        status: e?.status,
        note: 'Transaction may still be pending - user should check history'
      });
      return;
    }
    
    if (msg.includes('insufficient funds')) Alert.alert('Error', 'Insufficient funds (gas or value) on this network.');
    else if (msg.includes('nonce') && msg.includes('too low')) Alert.alert('Error', 'Nonce too low. Please try again.');
    else if (msg.includes('replacement') && msg.includes('fee')) Alert.alert('Error', 'Replacement fee too low. Try again with defaults.');
    else if (msg.includes('price below minimum') || msg.includes('tip cap')) Alert.alert('Error', 'Network minimum gas/tip not met.');
    else Alert.alert('Error', errorStr);
  }

  const amountPlaceholder =
    selectedAsset?.isNative
      ? (amountUnit === 'token' ? `Enter ${NATIVE_SYMBOL} Amount`
        : amountUnit === 'usd' ? 'Enter USD Amount'
        : `Enter ${localCode} Amount`)
      : `Enter ${selectedAsset?.symbol || 'TOKEN'} Amount`;

  const disableUsdLocal = !selectedAsset?.isNative;

  // CRITICAL: Fetch token prices for ERC-20 tokens to calculate USD values
  const [tokenPrices, setTokenPrices] = React.useState<Record<string, number>>({});
  const [pricesFetched, setPricesFetched] = React.useState(false);
  
  React.useEffect(() => {
    const fetchTokenPrices = async () => {
      try {
        // Get unique ERC-20 token symbols from assetOptions
        const erc20Symbols = assetOptions
          .filter(a => !a.isNative && a.symbol)
          .map(a => a.symbol.toUpperCase())
          .filter((symbol, index, arr) => arr.indexOf(symbol) === index); // Unique symbols
        
        if (erc20Symbols.length === 0) {
          setPricesFetched(true);
          return;
        }
        
        const { priceService } = await import('../../services/PriceService');
        const prices = await priceService.getPrices(erc20Symbols, localCode);
        
        // Convert to simple USD price map
        const priceMap: Record<string, number> = {};
        Object.keys(prices).forEach(key => {
          priceMap[key.toUpperCase()] = prices[key].usd || 0;
        });
        
        setTokenPrices(priceMap);
        setPricesFetched(true);
        console.log('SendTab: Fetched prices for', Object.keys(priceMap).length, 'tokens:', priceMap);
      } catch (error) {
        console.warn('SendTab: Could not fetch token prices for asset picker:', error);
        setPricesFetched(true); // Mark as fetched even on error
      }
    };
    
    fetchTokenPrices();
  }, [assetOptions, localCode]);
  
  // CRITICAL: Filter assets to only show those with balance > $0 USD value
  // Also calculate USD value for display
  const pickerOptions = useMemo(() => {
    // Calculate USD values for each asset
    const assetsWithUsdValue = assetOptions.map(a => {
      const balanceNum = parseFloat(a.balanceFormatted || '0');
      let usdValue = 0;
      
      if (a.isNative) {
        // Native token: use nativePriceUSD
        usdValue = balanceNum * nativePriceUSD;
      } else {
        // ERC-20 token: use fetched price
        const tokenPrice = tokenPrices[a.symbol.toUpperCase()] || 0;
        usdValue = balanceNum * tokenPrice;
      }
      
      return {
        ...a,
        usdValue,
        // For display: show token amount and USD value
        // displayLabel will be set in the return statement below
        displayLabel: '', // Not used - will be set in map
      };
    });
    
    // CRITICAL: Filter to only show assets with balance > 0 (not USD value)
    // USD value might be 0 if prices aren't loaded yet, but we still want to show the asset
    const filteredAssets = assetsWithUsdValue.filter(a => {
      const balanceWei = ethers.BigNumber.from(a.balanceWei || '0');
      if (balanceWei.isZero()) return false; // Always exclude zero balance
      
      // Show asset even if USD value is 0 (prices might not be loaded yet)
      // User can still see the token amount and network
      return true;
    });
    
    return filteredAssets.map(a => ({
      label: a.usdValue > 0 
        ? `${a.symbol} • ${a.chain.shortName || a.chain.name} • ${fmt(parseFloat(a.balanceFormatted || '0'), 6)} ($${fmt(a.usdValue, 2)})`
        : pricesFetched 
          ? `${a.symbol} • ${a.chain.shortName || a.chain.name} • ${fmt(parseFloat(a.balanceFormatted || '0'), 6)} ($0.00)`
          : `${a.symbol} • ${a.chain.shortName || a.chain.name} • ${fmt(parseFloat(a.balanceFormatted || '0'), 6)} (...)`, // Show loading indicator
      value: a.key,
    }));
  }, [assetOptions, nativePriceUSD, tokenPrices]);

  useEffect(() => {
    if (showScanner && !permission?.granted) requestPermission();
  }, [showScanner, permission, requestPermission]);

  const handleRefresh = useCallback(async () => {
    if (!fromAddress) return;
    setRefreshing(true);
    try {
      // Reload asset index to refresh balances
      const list = await loadAssetIndex(fromAddress);
      setAssetOptions(list);
      console.log('SendTab: ✅ Refreshed assets - found', list.length, 'assets');
    } catch (error) {
      console.error('SendTab: Error refreshing assets:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fromAddress, loadAssetIndex]);

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      contentContainerStyle={styles.scrollContent}
    >
      {/* Recipient */}
      <View style={styles.section}>
        <Text style={styles.label}>Send to:</Text>
        <View style={styles.addressRow}>
          <TextInput
            style={styles.input}
            placeholder="Wallet address of recipient - or .."
            value={toAddress}
            onChangeText={(v) => setToAddress(normalizeAddress(v))}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => { setShowScanner(true); setScanned(false); }} style={styles.qrBtn}>
            <Text style={styles.qrText}>SCAN QR</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.separator} />

      {/* Asset picker */}
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={styles.label}>What crypto currency would you like to send:</Text>
          <TouchableOpacity 
            onPress={handleRefresh} 
            disabled={refreshing}
            style={{ padding: 8, backgroundColor: '#0A84FF', borderRadius: 4 }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              {refreshing ? 'Refreshing...' : '🔄 Refresh'}
            </Text>
          </TouchableOpacity>
        </View>
        <Picker
          selectedValue={selectedKey}
          onValueChange={(val) => setSelectedKey(String(val))}
          style={styles.picker as any}
        >
          {pickerOptions.length === 0
            ? <Picker.Item label="Loading assets..." value="" />
            : pickerOptions.map(opt => <Picker.Item key={opt.value} label={opt.label} value={opt.value} />)}
        </Picker>
      </View>
      <View style={styles.separator} />

      {/* Amount */}
      <View style={styles.section}>
        <Text style={styles.label}>How much do you want to send:</Text>
        <View style={styles.unitRow}>
          <TouchableOpacity
            style={amountUnit === 'token' ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setAmountUnit('token')}
          >
            <Text style={amountUnit === 'token' ? styles.unitTextActive : styles.unitText}>
              {selectedAsset?.isNative ? NATIVE_SYMBOL : (selectedAsset?.symbol || 'TOKEN')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={disableUsdLocal}
            style={(amountUnit === 'usd' && !disableUsdLocal) ? styles.unitButtonActive : styles.unitButtonDisabled}
            onPress={() => !disableUsdLocal && setAmountUnit('usd')}
          >
            <Text style={(amountUnit === 'usd' && !disableUsdLocal) ? styles.unitTextActive : styles.unitTextDisabled}>USD</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={disableUsdLocal}
            style={(amountUnit === 'local' && !disableUsdLocal) ? styles.unitButtonActive : styles.unitButtonDisabled}
            onPress={() => !disableUsdLocal && setAmountUnit('local')}
          >
            <Text style={(amountUnit === 'local' && !disableUsdLocal) ? styles.unitTextActive : styles.unitTextDisabled}>
              {localCode}
            </Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.amountInput}
          placeholder={amountPlaceholder}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        <Text style={styles.feeInline}>Check entries carefully before sending payments, the estimated fee is: {feeEstimate}</Text>
      </View>
      <View style={styles.separator} />

      {/* send */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={!selectedAsset}>
          <Text style={styles.sendButtonText}>SEND PAYMENT</Text>
        </TouchableOpacity>
      </View>

      {/* QR modal */}
      {showScanner && (
        <View style={styles.scannerContainer}>
          {permission?.granted ? (
            <>
              {!scanned && (
                <CameraView
                  style={styles.camera}
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                />
              )}
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowScanner(false)}>
                <Text style={styles.closeText}>Close Scanner</Text>
              </TouchableOpacity>
              {scanned && (
                <TouchableOpacity style={styles.scanAgainButton} onPress={() => setScanned(false)}>
                  <Text>Scan Again</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={{ color: '#fff' }}>No camera access. Check settings.</Text>
          )}
        </View>
      )}

      {/* Busy overlay */}
      {busyStage && (
        <Modal visible transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <ActivityIndicator size="large" color="#0A84FF" />
            <Text style={{ color: '#fff', marginTop: 12 }}>
              {busyStage === 'preparing' && 'Preparing…'}
              {busyStage === 'fee' && 'Calculating fees…'}
              {busyStage === 'submitting' && 'Submitting transaction…'}
            </Text>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 16, paddingBottom: 20 },
  section: { marginBottom: 16 },
  separator: { height: 1, backgroundColor: '#E6E6E6', marginVertical: 8 },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#111' },
  addressRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, padding: 10, borderColor: '#ddd', marginRight: 8, borderRadius: 8 },
  picker: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  unitRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  unitButton: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f3f4f6', borderRadius: 20 },
  unitButtonActive: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#0A84FF', borderRadius: 20 },
  unitButtonDisabled: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#e5e7eb', borderRadius: 20 },
  unitText: { color: '#0A84FF', fontWeight: 'bold' },
  unitTextActive: { color: '#fff', fontWeight: 'bold' },
  unitTextDisabled: { color: '#9ca3af', fontWeight: 'bold' },
  amountInput: { borderWidth: 1, padding: 10, borderColor: '#ddd', borderRadius: 8, height: 44 },
  feeInline: { marginTop: 8, color: '#f70808ff', fontWeight: '600' },
  sendButton: { backgroundColor: '#0A84FF', padding: 14, borderRadius: 10, alignItems: 'center' },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  qrBtn: { backgroundColor: '#0A84FF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  qrText: { color: '#fff', fontWeight: 'bold' },
  scannerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
  camera: { flex: 1, width: '100%' },
  closeButton: { position: 'absolute', top: 40, right: 20, backgroundColor: 'white', padding: 10, borderRadius: 5 },
  closeText: { color: 'black' },
  scanAgainButton: { backgroundColor: 'white', padding: 10, borderRadius: 5, marginTop: 20 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
});

export default SendTab;
