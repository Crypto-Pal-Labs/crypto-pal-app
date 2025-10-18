// src/screens/Pay/SendTab.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, Alert, StyleSheet,
  ActivityIndicator, TouchableOpacity, Modal, Linking
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

const FALLBACK_GAS_LIMIT_NATIVE = ethers.BigNumber.from(65000);
const FALLBACK_GAS_LIMIT_ERC20  = ethers.BigNumber.from(90000);
const FALLBACK_GAS_PRICE        = ethers.utils.parseUnits('2', 'gwei');

const FEE_TIMEOUT_MS = 1500;
const MAX_FETCH_MS  = 6500;
const SOFT_FETCH_MS = 3500;

const ASSET_INDEX_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ASSET_INDEX_KEY = (addr: string) => `assetIndex_v1:${addr.toLowerCase()}`;
const INVALIDATE_KEY  = (addr: string, cid: number) => `assetsInvalidate:${addr.toLowerCase()}:${cid}`;

// Native symbol → CoinGecko id
const CG_IDS: Record<'ETH' | 'BNB' | 'MATIC', string> = {
  ETH: 'ethereum',
  BNB: 'binancecoin',
  MATIC: 'matic-network',
};
// Native symbol → CoinPaprika id
const PAPRIKA_IDS: Record<'ETH' | 'BNB' | 'MATIC', string> = {
  ETH: 'eth-ethereum',
  BNB: 'bnb-binance-coin',
  MATIC: 'matic-polygon',
};

// Optional CG API keys (demo or pro)
const CG_DEMO = (process.env.EXPO_PUBLIC_COINGECKO_API_KEY || '').trim();
const CG_PRO  = (process.env.EXPO_PUBLIC_COINGECKO_PRO_API_KEY || '').trim();

const gwei = (n: number) => ethers.utils.parseUnits(String(n), 'gwei');

const maskAddr = (a: string) =>
  a?.startsWith('0x') && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
const fmt = (n: number, dp = 6) =>
  Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/, '').replace(/\.$/, '') : '—';

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { onTimeout ? resolve(onTimeout()) : reject(new Error('timeout')); }, ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); onTimeout ? resolve(onTimeout()) : reject(e); });
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
async function getNativeUsdPrice(sym: 'ETH'|'BNB'|'MATIC'): Promise<number> {
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
  nativeSymbol: 'ETH' | 'BNB' | 'MATIC';
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

  // QR
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Form
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [busyStage, setBusyStage] = useState<null | 'preparing' | 'fee' | 'submitting'>(null);

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
  const activeChain: EvmChain = useMemo(
    () => selectedAsset?.chain || defaultChain,
    [selectedAsset, defaultChain]
  );

  const floors = useMemo(() => {
    const cid = activeChain.chainId;
    return CHAIN_FEE_FLOORS[cid] || {
      minPriorityGwei: DEFAULT_MIN_PRIORITY_GWEI,
      minGasGwei: DEFAULT_MIN_GAS_GWEI, // ✅ correct key
    };
  }, [activeChain.chainId]);

  const RPC_URL = activeChain.rpcUrls[0] || '';
  const EXPLORER_BASE = activeChain.explorerBase;
  const NATIVE_SYMBOL = activeChain.nativeSymbol as 'ETH'|'BNB'|'MATIC';
  const MIN_TIP = gwei(floors.minPriorityGwei);
  const MIN_GAS = gwei(floors.minGasGwei || DEFAULT_MIN_GAS_GWEI); // ✅ correct key

  const makeProvider = () =>
    new ethers.providers.StaticJsonRpcProvider(RPC_URL, { chainId: activeChain.chainId, name: activeChain.name });

  const getSigner = async () => {
    const mnemonic = await SecureStore.getItemAsync('mnemonic');
    if (!mnemonic) throw new Error('No mnemonic found—cannot sign transaction.');
    const wallet = ethers.Wallet.fromMnemonic(mnemonic);
    return wallet.connect(makeProvider());
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

    await Promise.allSettled(CHAINS.map(async (c) => {
      const provider = new ethers.providers.StaticJsonRpcProvider(c.rpcUrls[0], { chainId: c.chainId, name: c.name });

      // Native via RPC
      try {
        const bal = await withTimeout(provider.getBalance(owner), SOFT_FETCH_MS, () => ethers.constants.Zero);
        if (!bal.isZero()) {
          out.push({
            key: `${c.chainId}:native`,
            chainId: c.chainId, chain: c, isNative: true,
            symbol: c.nativeSymbol, name: `${c.nativeSymbol} on ${c.shortName || c.name}`,
            decimals: 18, balanceWei: bal.toString(), balanceFormatted: ethers.utils.formatEther(bal),
          });
        }
      } catch {}

      // ERC-20 via Covalent
      try {
        const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/balances_v2/?quote-currency=USD&nft=false&no-nft-fetch=true`;
        const json = await withTimeout(covalentGet(url), MAX_FETCH_MS, () => ({ data: { items: [] } } as any));
        const items: any[] = (json as any)?.data?.items || [];
        for (const it of items) {
          const contract = String(it?.contract_address || '').toLowerCase();
          if (!contract || contract === '0x0000000000000000000000000000000000000000' || contract === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') continue;
          const decimals = Number(it?.contract_decimals ?? 18);
          const symbol = String(it?.contract_ticker_symbol || '').toUpperCase() || 'TOKEN';
          const name = String(it?.contract_name || symbol);
          const balStr = String(it?.balance || '0');
          if (!ethers.BigNumber.from(balStr || '0').gt(0)) continue;

          out.push({
            key: `${c.chainId}:${contract}`,
            chainId: c.chainId, chain: c, isNative: false, contract,
            symbol, name, decimals: Number.isFinite(decimals) ? decimals : 18,
            balanceWei: balStr,
            balanceFormatted: ethers.utils.formatUnits(balStr, Number.isFinite(decimals) ? decimals : 18),
          });
        }
      } catch {}
    }));

    out.sort((a, b) => (a.chainId - b.chainId) || a.symbol.localeCompare(b.symbol));
    try { await AsyncStorage.setItem(ASSET_INDEX_KEY(owner), JSON.stringify({ at: Date.now(), list: out })); } catch {}
    return out;
  }, []);

  useEffect(() => {
    (async () => {
      if (!fromAddress) return;
      const list = await loadAssetIndex(fromAddress);
      setAssetOptions(list);
      setSelectedKey(list.length > 0 ? list[0].key : `${defaultChain.chainId}:native`);
    })();
  }, [fromAddress, loadAssetIndex, defaultChain.chainId]);

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
      try {
        const provider = makeProvider();
        const fd = await withTimeout(provider.getFeeData(), FEE_TIMEOUT_MS, () => ({
          gasPrice: FALLBACK_GAS_PRICE, maxFeePerGas: null, maxPriorityFeePerGas: null,
        } as any));

        let gasLim: ethers.BigNumber;
        if (selectedAsset.isNative) {
          const value = parseAmountToWei(amount, selectedAsset, amountUnit, nativePriceUSD, usdToLocal);
          gasLim = await withTimeout(
            provider.estimateGas({ to: candidate, value }),
            FEE_TIMEOUT_MS,
            () => FALLBACK_GAS_LIMIT_NATIVE
          );
        } else {
          const signer = (ethers.Wallet.createRandom()).connect(provider);
          const contract = new ethers.Contract(selectedAsset.contract!, ERC20_ABI, signer);
          const value = ethers.utils.parseUnits(amount || '0', selectedAsset.decimals || 18);
          gasLim = await withTimeout(
            contract.estimateGas.transfer(candidate, value, {}),
            FEE_TIMEOUT_MS,
            () => FALLBACK_GAS_LIMIT_ERC20
          );
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
          let gp = fd.gasPrice ?? FALLBACK_GAS_PRICE;
          if (gp.lt(MIN_GAS)) gp = MIN_GAS;
          perGas = gp;
        }

        const feeNative = parseFloat(ethers.utils.formatEther(gasLim.mul(perGas)));
        setFeeEstimate(`~${fmt(feeNative)} ${NATIVE_SYMBOL}`);
      } catch {
        const gl = selectedAsset.isNative ? FALLBACK_GAS_LIMIT_NATIVE : FALLBACK_GAS_LIMIT_ERC20;
        const feeNative = parseFloat(ethers.utils.formatEther(gl.mul(MIN_GAS)));
        setFeeEstimate(`~${fmt(feeNative)} ${NATIVE_SYMBOL} (fallback)`);
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
      const fd = await withTimeout(provider.getFeeData(), FEE_TIMEOUT_MS, () => ({
        gasPrice: FALLBACK_GAS_PRICE, maxFeePerGas: null, maxPriorityFeePerGas: null,
      } as any));
      let overrides: any = {};
      if (fd.maxFeePerGas && fd.maxPriorityFeePerGas) {
        let tip = fd.maxPriorityFeePerGas; if (tip.lt(MIN_TIP)) tip = MIN_TIP;
        let maxFee = fd.maxFeePerGas; const floorMax = tip.mul(2).add(ethers.utils.parseUnits('20','gwei')); if (maxFee.lt(floorMax)) maxFee = floorMax;
        overrides.maxPriorityFeePerGas = tip; overrides.maxFeePerGas = maxFee;
      } else {
        let gp = fd.gasPrice ?? FALLBACK_GAS_PRICE; if (gp.lt(MIN_GAS)) gp = MIN_GAS;
        overrides.gasPrice = gp;
      }

      let txHash = '';
      let effectiveFeeNative = 0;

      if (selectedAsset.isNative) {
        const gasLim = await withTimeout(signer.estimateGas({ to: candidate, value: valueBN }), FEE_TIMEOUT_MS, () => FALLBACK_GAS_LIMIT_NATIVE);
        overrides.gasLimit = gasLim;

        const summary = confirmSummary({
          enteredAmount: amount,
          unit: amountUnit,
          assetSymbol: NATIVE_SYMBOL,
          isNative: true,
          valueBN,
          nativePriceUSD,
          usdToLocal,
          localCode,
          feeEstimate,
          chainLabel: activeChain.shortName || activeChain.name,
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
                  const tx = await signer.sendTransaction({ to: candidate, value: valueBN, ...overrides });
                  const receipt = await tx.wait(1);
                  txHash = receipt.transactionHash;
                  effectiveFeeNative = parseFloat(ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice)));

                  await afterSuccessUpdateCaches(fromAddress!, selectedAsset, valueBN, effectiveFeeNative, txHash, candidate, true, activeChain, EXPLORER_BASE, NATIVE_SYMBOL);
                } catch (e: any) { onSendError(e); }
              },
            },
          ]
        );
        return;
      }

      // ERC-20 transfer — confirmation
      const summaryErc20 = confirmSummary({
        enteredAmount: amount,
        unit: 'token',
        assetSymbol: selectedAsset.symbol,
        isNative: false,
        valueBN,
        nativePriceUSD,
        usdToLocal,
        localCode,
        feeEstimate,
        chainLabel: activeChain.shortName || activeChain.name,
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
      const gasLim = await withTimeout(contract.estimateGas.transfer(candidate, valueBN, {}), FEE_TIMEOUT_MS, () => FALLBACK_GAS_LIMIT_ERC20);
      const tx = await contract.transfer(candidate, valueBN, { ...overrides, gasLimit: gasLim });
      const receipt = await tx.wait(1);
      txHash = receipt.transactionHash;
      effectiveFeeNative = parseFloat(ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice)));

      await afterSuccessUpdateCaches(fromAddress!, selectedAsset, valueBN, effectiveFeeNative, txHash, candidate, false, activeChain, EXPLORER_BASE, NATIVE_SYMBOL);
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
    NATIVE_SYMBOL: 'ETH'|'BNB'|'MATIC'
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
      chainId: activeChain.chainId,
    };
    const lst = JSON.parse((await AsyncStorage.getItem('localTxs')) || '[]');
    lst.push(localTx);
    await AsyncStorage.setItem('localTxs', JSON.stringify(lst));

    await AsyncStorage.setItem(INVALIDATE_KEY(owner, activeChain.chainId), String(Date.now()));

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
        `Sent on ${activeChain.shortName || activeChain.name}`,
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
    if (msg.includes('insufficient funds')) Alert.alert('Error', 'Insufficient funds (gas or value) on this network.');
    else if (msg.includes('nonce') && msg.includes('too low')) Alert.alert('Error', 'Nonce too low. Please try again.');
    else if (msg.includes('replacement') && msg.includes('fee')) Alert.alert('Error', 'Replacement fee too low. Try again with defaults.');
    else if (msg.includes('price below minimum') || msg.includes('tip cap')) Alert.alert('Error', 'Network minimum gas/tip not met.');
    else Alert.alert('Error', parseDeepError(e));
  }

  const amountPlaceholder =
    selectedAsset?.isNative
      ? (amountUnit === 'token' ? `Enter ${NATIVE_SYMBOL} Amount`
        : amountUnit === 'usd' ? 'Enter USD Amount'
        : `Enter ${localCode} Amount`)
      : `Enter ${selectedAsset?.symbol || 'TOKEN'} Amount`;

  const disableUsdLocal = !selectedAsset?.isNative;

  const pickerOptions = useMemo(() => {
    return assetOptions.map(a => ({
      label: `${a.symbol} • ${(a.chain.shortName || a.chain.name)} • ${fmt(parseFloat(a.balanceFormatted), 6)}`,
      value: a.key,
    }));
  }, [assetOptions]);

  useEffect(() => {
    if (showScanner && !permission?.granted) requestPermission();
  }, [showScanner, permission, requestPermission]);

  return (
    <View style={styles.container}>
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
        <Text style={styles.label}>What crypto currency would you like to send:</Text>
        <Picker
          selectedValue={selectedKey}
          onValueChange={(val) => setSelectedKey(String(val))}
          style={styles.picker as any}
        >
          {pickerOptions.length === 0
            ? <Picker.Item label="No assets with balance" value="" />
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
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
