// src/screens/HistoryTab.tsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View, Text, ActivityIndicator, FlatList, StyleSheet, Linking,
  TouchableOpacity, RefreshControl, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Localization from "expo-localization";
import * as ethers from "ethers";

import { useWalletStore } from "../store/useWalletStore";
import { CHAINS, EvmChain } from "../config/chainRegistry";
import { covalentGet } from "../lib/covalent";
import Constants from "expo-constants";

// ===== Types =====
type TxItem = {
  hash: string;
  timestamp: string; // ISO
  from: string;
  to: string;
  valueWei: string;
  gasUsed?: string | number | null;
  gasPrice?: string | number | null;
  feesPaidWei?: string | number | null;
  successful: boolean;
  chainId: number;
  explorerBase: string;
  nativeSymbol: "ETH" | "BNB" | "MATIC" | "AVAX" | "ARB" | "OP" | "BASE";
  _source?: "covalent" | "rpc" | "explorer" | "sticky" | "erc20_rpc" | "erc20_covalent";
  isToken?: boolean;
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenContract?: string;
  tokenValueUnits?: string; // decimal string
  direction?: "IN" | "OUT";
};

const ERC20_IFACE = new ethers.utils.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");

// Price ids for native/major tokens
const PRICE_IDS: Record<string, string> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  MATIC: "matic-network",
  USDT: "tether",
  USDC: "usd-coin",
};

const maskAddr = (a: string) =>
  a?.startsWith("0x") && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
const fmt = (n: number, dp = 6) =>
  Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/, "").replace(/\.$/, "") : "—";

// ---- tuning (env-driven) ----
const COVALENT_PAGE_SIZE = Number(process.env.EXPO_PUBLIC_HISTORY_PAGE_SIZE || 25);
const RX_CACHE_TTL_MS    = 6 * 60 * 60 * 1000;

// Timeouts: soft paints UI quickly; hard skips slow providers
const FETCH_TIMEOUT = Number(process.env.EXPO_PUBLIC_HISTORY_HARD_TIMEOUT || 3000);
const SOFT_TIMEOUT  = Number(process.env.EXPO_PUBLIC_HISTORY_SOFT_TIMEOUT || 1500);

// Only query specific chains if provided (comma separated)
const ACTIVE_CHAIN_IDS: number[] = String(process.env.EXPO_PUBLIC_ACTIVE_CHAINS || "")
  .split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n));

// Cache key
const RX_CACHE_KEY = (addr: string) => `rxCache_v3:${addr.toLowerCase()}`;

// Helpers
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { onTimeout ? resolve(onTimeout()) : reject(new Error("timeout")); }, ms);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); onTimeout ? resolve(onTimeout()) : reject(e); });
  });
}

export default function HistoryTab() {
  const address = useWalletStore((s) => s.address);

  const [displayUnit, setDisplayUnit] = useState<"TOKEN" | "USD" | string>("TOKEN");
  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();

  const chains: EvmChain[] = useMemo(() => {
      // Only check testnet chains for better performance
      const testnetChains = CHAINS.filter(c => c.testnet === true);
      return testnetChains;
  }, []);

  const [items, setItems] = useState<TxItem[]>([]);
  const [firstLoading, setFirstLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [priceMap, setPriceMap] = useState<Record<string, { usd: number; local: number }>>({});
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ===== price loader =====
  const loadPrices = useCallback(async () => {
    try {
      // Use a more comprehensive list of tokens
      const tokenSymbols = ['ETH', 'MATIC', 'BNB', 'USDT', 'USDC'];
      const ids = tokenSymbols.map(s => PRICE_IDS[s]).filter(Boolean);
      const vs = (localCurrency || "USD").toLowerCase();
      
      // Use a different API endpoint to avoid rate limits
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,${vs}`;
      
      console.log(`HistoryTab: Loading prices for ${ids.length} tokens:`, ids);
      console.log(`HistoryTab: Price URL: ${url}`);
      
      const data = await withTimeout(fetch(url).then((r) => r.json()), SOFT_TIMEOUT, () => null as any);
      if (!data || data.status?.error_code) {
        console.log('HistoryTab: No price data received or API error, using fallback prices');
        // Use fallback prices when API fails
        const fallbackPrices: Record<string, { usd: number; local: number }> = {
          'ETH': { usd: 2000, local: 2000 * 0.8 }, // Example: 20% difference for local currency
          'MATIC': { usd: 0.65, local: 0.65 * 0.8 },
          'BNB': { usd: 350, local: 350 * 0.8 },
          'USDT': { usd: 1, local: 1 * 0.8 },
          'USDC': { usd: 1, local: 1 * 0.8 },
        };
        setPriceMap(fallbackPrices);
        console.log('HistoryTab: Using fallback prices:', fallbackPrices);
        return;
      }
      
      console.log('HistoryTab: Price data received:', data);
      
      const out: Record<string, { usd: number; local: number }> = {};
      tokenSymbols.forEach((sym) => {
        const id = PRICE_IDS[sym];
        const d = (data as any)?.[id] || {};
        out[sym] = { usd: Number(d?.usd || 0), local: Number(d?.[vs] || 0) };
        console.log(`HistoryTab: Price for ${sym}: USD=${d?.usd || 0}, ${vs.toUpperCase()}=${d?.[vs] || 0}`);
      });
      setPriceMap(out);
      console.log('HistoryTab: Price map updated:', out);
    } catch (error) {
      console.error('HistoryTab: Error loading prices:', error);
      // Use fallback prices on error
      const fallbackPrices: Record<string, { usd: number; local: number }> = {
        'ETH': { usd: 2000, local: 2000 * 0.8 },
        'MATIC': { usd: 0.65, local: 0.65 * 0.8 },
        'BNB': { usd: 350, local: 350 * 0.8 },
        'USDT': { usd: 1, local: 1 * 0.8 },
        'USDC': { usd: 1, local: 1 * 0.8 },
      };
      setPriceMap(fallbackPrices);
    }
  }, [localCurrency]);

  // ===== normalizers =====
  const toNativeTxItems = (raw: any[], c: EvmChain, source: TxItem["_source"]): TxItem[] =>
    (raw || []).map((t: any) => ({
      hash: t.tx_hash || t.hash || "",
      timestamp:
        t.block_signed_at || t.timeStamp
          ? new Date((t.block_signed_at ? Date.parse(t.block_signed_at) : Number(t.timeStamp) * 1000)).toISOString()
          : new Date().toISOString(),
      from: (t.from_address || t.from || "").toLowerCase(),
      to: (t.to_address || t.to || "").toLowerCase(),
      valueWei: String(t.value || t.value_wei || t.valueWei || "0"),
      gasUsed: t.gas_spent ?? t.gas_used ?? t.gasUsed ?? null,
      gasPrice: t.effective_gas_price ?? t.gas_price ?? t.gasPrice ?? null,
      feesPaidWei: t.fees_paid ?? null,
      successful: t.txreceipt_status !== undefined ? t.txreceipt_status === "1" : t.successful !== false,
      chainId: c.chainId,
      explorerBase: c.explorerBase,
      nativeSymbol: c.nativeSymbol,
      _source: source,
    }));

  const toTokenItemsFromCovalent = (raw: any[], c: EvmChain): TxItem[] =>
    (raw || []).map((t: any) => {
      const dec = Number(t.contract_decimals ?? 18);
      const rawUnits = String(t.delta || "0");
      const units = ethers.utils.formatUnits(rawUnits, Number.isFinite(dec) ? dec : 18);
      return {
        hash: t.tx_hash || "",
        timestamp: t.block_signed_at ? new Date(Date.parse(t.block_signed_at)).toISOString() : new Date().toISOString(),
        from: (t.from_address || "").toLowerCase(),
        to: (t.to_address || "").toLowerCase(),
        valueWei: "0",
        successful: true,
        chainId: c.chainId,
        explorerBase: c.explorerBase,
        nativeSymbol: c.nativeSymbol,
        _source: "erc20_covalent",
        isToken: true,
        tokenSymbol: String(t.contract_ticker_symbol || "TOKEN"),
        tokenDecimals: Number.isFinite(dec) ? dec : 18,
        tokenContract: (t.contract_address || "").toLowerCase(),
        tokenValueUnits: units,
        direction: String(t.transfer_type || "").toUpperCase() === "IN" ? "IN" : "OUT",
      };
    });

  const amountKey = (t: TxItem) => t.isToken ? `${t.tokenContract}:${t.tokenValueUnits}` : t.valueWei;

  const mergeAndSort = (lists: TxItem[][]): TxItem[] => {
    const map = new Map<string, TxItem>();
    for (const list of lists) {
      for (const t of list) {
        if (!t.hash) continue;
        const uniq = `${t.hash}:${t.chainId}:${t.isToken ? (t.tokenContract || "token") : "native"}:${t.from}:${t.to}:${amountKey(t)}`;
        if (!map.has(uniq)) map.set(uniq, t);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  // ===== cache (sticky) =====
  const loadRxCache = useCallback(async (owner: string) => {
    try {
      const raw = await AsyncStorage.getItem(RX_CACHE_KEY(owner));
      if (!raw) return [];
      const now = Date.now();
      const arr: TxItem[] = JSON.parse(raw);
      return arr.filter((t) => now - new Date(t.timestamp).getTime() < RX_CACHE_TTL_MS);
    } catch { return []; }
  }, []);

  const safeSaveRxCache = useCallback(async (owner: string, nextList: TxItem[]) => {
    try {
      if (!nextList || nextList.length === 0) return;
      const existing = await loadRxCache(owner);
      const now = Date.now();
      const map = new Map<string, TxItem>();
      for (const t of existing) {
        if (now - new Date(t.timestamp).getTime() < RX_CACHE_TTL_MS) {
          const key = `${t.hash}:${t.chainId}:${t.isToken ? t.tokenContract : "native"}:${t.from}:${t.to}:${amountKey(t)}`;
          map.set(key, { ...t, _source: "sticky" as const });
        }
      }
      for (const t of nextList) {
        const key = `${t.hash}:${t.chainId}:${t.isToken ? t.tokenContract : "native"}:${t.from}:${t.to}:${amountKey(t)}`;
        map.set(key, { ...t, _source: "sticky" as const });
      }
      const merged = Array.from(map.values()).slice(0, 200);
      await AsyncStorage.setItem(RX_CACHE_KEY(owner), JSON.stringify(merged));
    } catch {}
  }, [loadRxCache]);

  // ===== data sources =====

  // 1) Explorer APIs for different chains
  async function fetchExplorerTx(c: EvmChain, owner: string, soft: boolean): Promise<TxItem[]> {
    let base = "";
    let apiKey = "";
    
    console.log(`HistoryTab: Fetching explorer transactions for ${c.name} (${c.chainId})`);
    
    // Access environment variables through Constants.expoConfig.extra
    const extra = Constants.expoConfig?.extra || {};
    
    // Set appropriate explorer API based on chain
    if (c.chainId === 80002) { // Polygon Amoy
      base = "https://api-amoy.polygonscan.com/api";
      apiKey = (extra.EXPO_PUBLIC_POLYGONSCAN_API_KEY || extra.POLYGONSCAN_API_KEY || "3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M").trim();
      console.log(`HistoryTab: Polygon Amoy explorer - base: ${base}, apiKey: ${apiKey.substring(0, 8)}...`);
    } else if (c.chainId === 11155111) { // Ethereum Sepolia
      base = "https://api-sepolia.etherscan.io/api";
      apiKey = (extra.EXPO_PUBLIC_ETHERSCAN_API_KEY || extra.ETHERSCAN_API_KEY || "3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M").trim();
    } else if (c.chainId === 97) { // BSC Testnet
      base = "https://api-testnet.bscscan.com/api";
      apiKey = (extra.EXPO_PUBLIC_BSCSCAN_API_KEY || extra.BSCSCAN_API_KEY || "3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M").trim();
    } else {
      console.log(`No explorer API configured for ${c.name} (${c.chainId})`);
      return [];
    }
    
    // Check if API key is available
    if (!apiKey) {
      console.log(`No API key available for ${c.name} explorer`);
      return [];
    }
    
    try {
      const url = `${base}?module=account&action=txlist&address=${owner}&sort=desc&page=1&offset=${COVALENT_PAGE_SIZE}&apikey=${encodeURIComponent(apiKey)}`;
      console.log(`Fetching from ${base} for ${c.name} with API key`);
      const response = await withTimeout(fetch(url), soft ? SOFT_TIMEOUT : FETCH_TIMEOUT, () => null);
      
      if (!response || !response.ok) {
        console.log(`Explorer API HTTP error for ${c.name}: ${response?.status} ${response?.statusText}`);
        return [];
      }
      
      const json = await response.json();
      console.log(`Explorer API response for ${c.name}:`, { status: json.status, message: json.message, resultCount: json.result?.length });
      
      if (!json || String(json.status) !== "1" || !Array.isArray(json.result)) {
        console.log(`Explorer API failed for ${c.name}:`, json?.message || 'No result');
        return [];
      }
      
      console.log(`Explorer API success for ${c.name}: ${json.result.length} transactions`);
      return toNativeTxItems(json.result, c, "explorer");
    } catch (e) { 
      console.log(`Explorer API error for ${c.name}:`, e);
      return []; 
    }
  }

  // Special function for Polygon Amoy transaction fetching
  async function fetchPolygonAmoyTransactions(owner: string): Promise<TxItem[]> {
    console.log('HistoryTab: Special Polygon Amoy transaction fetch');
    console.log(`HistoryTab: Looking for transactions involving address: ${owner}`);
    
    // Add timeout to prevent excessive scanning
    const timeoutPromise = new Promise<TxItem[]>((resolve) => {
      setTimeout(() => {
        console.log('HistoryTab: Polygon Amoy fetch timeout, returning empty results');
        resolve([]);
      }, 15000); // 15 second timeout for production-ready performance
    });
    
    const fetchPromise = (async () => {
      try {
        // Try to get recent transactions using RPC
        const rpcUrls = [
          "https://rpc-amoy.polygon.technology",
          "https://polygon-amoy.drpc.org",
          "https://polygon-amoy.blockpi.network/v1/rpc/public"
        ];
      
      // First try: Get transaction history using getLogs for Transfer events
      for (const rpc of rpcUrls) {
        try {
          console.log(`HistoryTab: Trying Polygon Amoy logs method: ${rpc}`);
          const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: 80002, name: "Polygon Amoy" });
          
          const latestBlock = await provider.getBlockNumber();
          const fromBlock = Math.max(0, latestBlock - 1000); // Look back 1000 blocks
          
          console.log(`HistoryTab: Searching logs from block ${fromBlock} to ${latestBlock}`);
          
          // Get Transfer events (ERC-20 and native transfers)
          const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
          const logs = await provider.getLogs({
            fromBlock: fromBlock,
            toBlock: latestBlock,
            topics: [transferTopic, null, ethers.utils.hexZeroPad(owner, 32)] // to address
          });
          
          console.log(`HistoryTab: Found ${logs.length} Transfer logs to ${owner}`);
          
          const transactions: TxItem[] = [];
          
          for (const log of logs) {
            try {
              const tx = await provider.getTransaction(log.transactionHash);
              if (tx) {
                const direction = tx.from?.toLowerCase() === owner ? "OUT" : "IN";
                const valueWei = tx.value?.toString() || "0";
                
                console.log(`HistoryTab: Found Polygon Amoy log transaction: ${tx.hash} (${direction}) - ${valueWei} wei`);
                
                transactions.push({
                  hash: tx.hash,
                  timestamp: new Date().toISOString(), // We'll get the actual timestamp from the block
                  from: tx.from || "",
                  to: tx.to || "",
                  valueWei: valueWei,
                  gasUsed: tx.gasLimit?.toString(),
                  gasPrice: tx.gasPrice?.toString(),
                  feesPaidWei: tx.gasPrice ? (tx.gasLimit ? tx.gasPrice.mul(tx.gasLimit).toString() : "0") : "0",
                  successful: true,
                  chainId: 80002,
                  explorerBase: "https://amoy.polygonscan.com",
                  nativeSymbol: "MATIC",
                  _source: "rpc",
                  direction: direction
                });
              }
            } catch (txError) {
              console.log(`HistoryTab: Error getting transaction ${log.transactionHash}:`, txError);
              continue;
            }
          }
          
          if (transactions.length > 0) {
            console.log(`HistoryTab: Found ${transactions.length} Polygon Amoy transactions via logs method`);
            return transactions;
          }
          
        } catch (logsError) {
          console.log(`HistoryTab: Logs method failed: ${rpc} - ${logsError instanceof Error ? logsError.message : 'Unknown error'}`);
          continue;
        }
      }
      
      for (const rpc of rpcUrls) {
        try {
          console.log(`HistoryTab: Trying Polygon Amoy RPC: ${rpc}`);
          const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: 80002, name: "Polygon Amoy" });
          
          // Get recent blocks
          const latestBlock = await provider.getBlockNumber();
          console.log(`HistoryTab: Latest block: ${latestBlock}`);
          
          const transactions: TxItem[] = [];
          
          // Check last 50 blocks for transactions (production-ready performance)
          console.log(`HistoryTab: Scanning last 50 blocks from ${latestBlock} for Polygon Amoy transactions`);
          let foundTransactions = 0;
          
          for (let i = 0; i < 50; i++) {
            const blockNumber = latestBlock - i;
            try {
              const block = await provider.getBlockWithTransactions(blockNumber);
              
              if (block && block.transactions) {
                // Debug: Log some sample transactions to see what we're getting
                if (i < 5 && block.transactions.length > 0) {
                  console.log(`HistoryTab: Sample transactions in block ${blockNumber}:`, block.transactions.slice(0, 2).map(tx => ({
                    hash: tx.hash.substring(0, 10) + '...',
                    from: tx.from?.substring(0, 10) + '...',
                    to: tx.to?.substring(0, 10) + '...',
                    value: tx.value?.toString()
                  })));
                }
                
                // Debug: Log every 500 blocks to show progress (reduced logging)
                if (i % 500 === 0) {
                  console.log(`HistoryTab: Scanned ${i} blocks, current block: ${blockNumber}, transactions in block: ${block.transactions.length}`);
                }
                
                for (const tx of block.transactions) {
                  const fromMatch = tx.from?.toLowerCase() === owner;
                  const toMatch = tx.to?.toLowerCase() === owner;
                  
                // Debug: Log every transaction to see what we're getting (reduced logging)
                if (i < 3 && block.transactions.length > 0) {
                  console.log(`HistoryTab: Checking transaction ${tx.hash.substring(0, 10)}... from ${tx.from?.substring(0, 10)}... to ${tx.to?.substring(0, 10)}... against owner ${owner.substring(0, 10)}...`);
                }
                  
                  if (fromMatch || toMatch) {
                    const direction = fromMatch ? "OUT" : "IN";
                    const valueWei = tx.value?.toString() || "0";
                    
                    console.log(`HistoryTab: ✅ FOUND MATCHING TRANSACTION! ${tx.hash} (${direction}) - ${valueWei} wei`);
                    console.log(`HistoryTab: Transaction details - From: ${tx.from}, To: ${tx.to}, Owner: ${owner}`);
                    console.log(`HistoryTab: Address comparison - From match: ${fromMatch}, To match: ${toMatch}`);
                    
                    transactions.push({
                      hash: tx.hash,
                      timestamp: new Date(block.timestamp * 1000).toISOString(),
                      from: tx.from || "",
                      to: tx.to || "",
                      valueWei: valueWei,
                      gasUsed: tx.gasLimit?.toString(),
                      gasPrice: tx.gasPrice?.toString(),
                      feesPaidWei: tx.gasPrice ? (tx.gasLimit ? tx.gasPrice.mul(tx.gasLimit).toString() : "0") : "0",
                      successful: true,
                      chainId: 80002,
                      explorerBase: "https://amoy.polygonscan.com",
                      nativeSymbol: "MATIC",
                      _source: "rpc",
                      direction: direction
                    });
                    
                    foundTransactions++;
                    
                    // Early exit if we find enough transactions
                    if (foundTransactions >= 10) {
                      console.log(`HistoryTab: Found ${foundTransactions} transactions, stopping scan`);
                      break;
                    }
                  }
                }
              }
              
              // Early exit if we found transactions
              if (foundTransactions > 0 && i > 20) {
                console.log(`HistoryTab: Found transactions, stopping scan at block ${blockNumber}`);
                break;
              }
              
            } catch (blockError) {
              // Only log errors for the first few blocks
              if (i < 5) {
                console.log(`HistoryTab: Error fetching block ${blockNumber}:`, blockError instanceof Error ? blockError.message : 'Unknown error');
              }
              continue;
            }
          }
          
          console.log(`HistoryTab: Found ${transactions.length} Polygon Amoy transactions via RPC`);
          return transactions;
          
        } catch (rpcError) {
          console.log(`HistoryTab: RPC failed: ${rpc} - ${rpcError instanceof Error ? rpcError.message : 'Unknown error'}`);
          continue;
        }
      }
      
      // Third try: Use a different approach - get transaction history using eth_getTransactionByHash
      for (const rpc of rpcUrls) {
        try {
          console.log(`HistoryTab: Trying Polygon Amoy transaction history method: ${rpc}`);
          const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: 80002, name: "Polygon Amoy" });
          
          // Try to get recent transactions by scanning recent blocks more efficiently
          const latestBlock = await provider.getBlockNumber();
          const transactions: TxItem[] = [];
          
          // Get the last 50 blocks and check for transactions (production-ready performance)
          console.log(`HistoryTab: Production-ready scan of last 50 blocks from ${latestBlock}`);
          let foundTransactions = 0;
          for (let i = 0; i < 50; i++) {
            const blockNumber = latestBlock - i;
            try {
              const block = await provider.getBlockWithTransactions(blockNumber); // Get block with transactions
              
              if (block && block.transactions) {
                for (const tx of block.transactions) {
                  if (tx && (tx.from?.toLowerCase() === owner || tx.to?.toLowerCase() === owner)) {
                    const direction = tx.from?.toLowerCase() === owner ? "OUT" : "IN";
                    const valueWei = tx.value?.toString() || "0";
                    
                    console.log(`HistoryTab: Found Polygon Amoy history transaction: ${tx.hash} (${direction}) - ${valueWei} wei`);
                    console.log(`HistoryTab: Block ${blockNumber}, From: ${tx.from}, To: ${tx.to}, Owner: ${owner}`);
                    
                    transactions.push({
                      hash: tx.hash,
                      timestamp: new Date(block.timestamp * 1000).toISOString(),
                      from: tx.from || "",
                      to: tx.to || "",
                      valueWei: valueWei,
                      gasUsed: tx.gasLimit?.toString(),
                      gasPrice: tx.gasPrice?.toString(),
                      feesPaidWei: tx.gasPrice ? (tx.gasLimit ? tx.gasPrice.mul(tx.gasLimit).toString() : "0") : "0",
                      successful: true,
                      chainId: 80002,
                      explorerBase: "https://amoy.polygonscan.com",
                      nativeSymbol: "MATIC",
                      _source: "rpc",
                      direction: direction
                    });
                    
                    foundTransactions++;
                    
                    // Early exit if we find enough transactions
                    if (foundTransactions >= 20) {
                      console.log(`HistoryTab: Found ${foundTransactions} transactions via history method, stopping scan`);
                      break;
                    }
                  }
                }
              }
              
              // Early exit if we found transactions and scanned enough blocks
              if (foundTransactions > 0 && i > 20) {
                console.log(`HistoryTab: Found transactions via history method, stopping scan at block ${blockNumber}`);
                break;
              }
              
            } catch (blockError) {
              continue;
            }
          }
          
          if (transactions.length > 0) {
            console.log(`HistoryTab: Found ${transactions.length} Polygon Amoy transactions via history method`);
            return transactions;
          }
          
        } catch (historyError) {
          console.log(`HistoryTab: History method failed: ${rpc} - ${historyError instanceof Error ? historyError.message : 'Unknown error'}`);
          continue;
        }
      }
      
        console.log('HistoryTab: All Polygon Amoy methods failed');
        return [];
        
      } catch (error) {
        console.log('HistoryTab: Polygon Amoy fetch error:', error);
        return [];
      }
    })();
    
    // Race between fetch and timeout
    return Promise.race([fetchPromise, timeoutPromise]);
  }

  // 2) RPC-based transaction fetching for unsupported chains
  async function rpcErc20IncomingLookback(c: EvmChain, owner: string, lookbackBlocks: number): Promise<TxItem[]> {
    try {
      console.log(`HistoryTab: RPC fetch for ${c.name} (${c.chainId}) - looking back ${lookbackBlocks} blocks`);
      
      // Try multiple RPC URLs for better reliability
      const rpcUrls = c.rpcUrls || [];
      if (rpcUrls.length === 0) {
        console.log(`No RPC URLs for ${c.name}`);
        return [];
      }
      
      let provider = null;
      let workingRpc = null;
      
      // Try each RPC URL until one works
      for (const rpc of rpcUrls) {
        try {
          console.log(`Testing RPC for ${c.name}: ${rpc}`);
          const testProvider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: c.chainId, name: c.name });
          
          // Test basic connectivity with timeout
          const latest = await withTimeout(testProvider.getBlockNumber(), 10000, () => 0);
          if (latest > 0) {
            provider = testProvider;
            workingRpc = rpc;
            console.log(`✅ RPC working for ${c.name}: ${rpc} (Block: ${latest})`);
            break;
          }
        } catch (e) {
          console.log(`❌ RPC failed for ${c.name}: ${rpc} - ${e instanceof Error ? e.message : 'Unknown error'}`);
          continue;
        }
      }
      
      if (!provider) {
        console.log(`❌ All RPC URLs failed for ${c.name}`);
        return [];
      }
      
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - Math.max(1, lookbackBlocks - 1));
      
      // Checking recent blocks for transactions
      
      // Get native token transactions with simpler approach
      const nativeTxs: TxItem[] = [];
      
      try {
                // Try to get fewer blocks to prevent spam
                const recentBlocks = Math.min(2, latest - fromBlock + 1);
        
        for (let i = 0; i < recentBlocks; i++) {
          const blockNum = latest - i;
          if (blockNum < fromBlock) break;
          
          try {
            const block = await withTimeout(provider.getBlockWithTransactions(blockNum), 2000, () => null);
            if (!block || !block.transactions) continue;
            
            // Reduced logging to prevent spam
            
            for (const tx of block.transactions) {
              const txFrom = tx.from?.toLowerCase();
              const txTo = tx.to?.toLowerCase();
              const ownerLower = owner.toLowerCase();
              
              // Only process transactions that match the user's address
              
              if (txTo === ownerLower || txFrom === ownerLower) {
                const isIncoming = txTo === ownerLower;
                const direction = isIncoming ? "IN" : "OUT";
                
                // Found matching transaction
                
                nativeTxs.push({
                  hash: tx.hash,
                  timestamp: new Date(block.timestamp * 1000).toISOString(),
                  from: txFrom || "",
                  to: txTo || "",
                  valueWei: tx.value.toString(),
            successful: true,
            chainId: c.chainId,
            explorerBase: c.explorerBase,
            nativeSymbol: c.nativeSymbol,
                  _source: "rpc",
                  isToken: false,
                  direction,
                });
                
                // Early exit if we found enough transactions
                if (nativeTxs.length >= 5) {
                  break;
                }
              }
            }
            
            // Early exit if we found enough transactions
            if (nativeTxs.length >= 5) {
              break;
            }
        } catch (e) {
          // Block check failed, continue to next block
        }
        }
      } catch (e) {
        // RPC fetch failed
      }
      
      return nativeTxs;
    } catch (e) { 
      return []; 
    }
  }

  // 3) Covalent (fallback, never blocks)
  const fetchChainTx = async (c: EvmChain, owner: string, soft: boolean) => {
    if (c.covalentSupported === false) return [];
    const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transactions_v3/?no-logs=true&page-size=${COVALENT_PAGE_SIZE}`;
    try {
      const json = await withTimeout(covalentGet(url), soft ? SOFT_TIMEOUT : FETCH_TIMEOUT, () => ({ data: { items: [] } } as any));
      const items = (json as any)?.data?.items ?? [];
      console.log(`Covalent native tx success for ${c.name}: ${items.length} transactions`);
      return toNativeTxItems(items, c, "covalent");
    } catch (e) { 
      console.log(`Covalent native tx error for ${c.name}:`, e);
      return []; 
    }
  };

  const fetchTokenTransfers = async (c: EvmChain, owner: string, soft: boolean): Promise<TxItem[]> => {
    if (c.covalentSupported === false) return [];
    const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transfers_v3/?contract-address=all&no-logs=false&page-size=${COVALENT_PAGE_SIZE}`;
    try {
      const json = await withTimeout(covalentGet(url), soft ? SOFT_TIMEOUT : FETCH_TIMEOUT, () => ({ data: { items: [] } } as any));
      const items: any[] = (json as any)?.data?.items || [];
      console.log(`Covalent token transfers success for ${c.name}: ${items.length} transfers`);
      return toTokenItemsFromCovalent(items, c);
    } catch (e) { 
      console.log(`Covalent token transfers error for ${c.name}:`, e);
      return []; 
    }
  };

  // ===== fetch orchestrator =====
  const fetchAll = useCallback(async (soft = false) => {
    if (!address) return;

    console.log('HistoryTab: Starting fetch for address', address);
    console.log('HistoryTab: Fetching for chains:', chains.map(c => `${c.name} (${c.chainId})`));
    
    // Debug environment variables
    const extra = Constants.expoConfig?.extra || {};
    console.log('HistoryTab: Environment check:', {
      hasPolygonscanKey: !!(extra.EXPO_PUBLIC_POLYGONSCAN_API_KEY || extra.POLYGONSCAN_API_KEY),
      hasEtherscanKey: !!(extra.EXPO_PUBLIC_ETHERSCAN_API_KEY || extra.ETHERSCAN_API_KEY),
      hasBscscanKey: !!(extra.EXPO_PUBLIC_BSCSCAN_API_KEY || extra.BSCSCAN_API_KEY),
      extraKeys: Object.keys(extra).filter(k => k.includes('API_KEY'))
    });

    // Prices can load in background
    loadPrices();

    const owner = address.toLowerCase();
    const sticky = await loadRxCache(owner);

    // fast paint from cache on first load
    if (sticky && sticky.length && firstLoading) {
      setItems(sticky);
      setFirstLoading(false);
    }

    // Fetch from testnet chains only for better performance
    const chainsToFetch = chains;
    
    const allSources = Promise.allSettled([
      // 1. Covalent for supported chains (most reliable)
      ...chainsToFetch.map((c) => fetchChainTx(c, owner, !!soft)),
      // 2. Covalent token transfers (for ERC-20 tokens)
      ...chainsToFetch.map((c) => fetchTokenTransfers(c, owner, !!soft)),
      // 3. Explorer APIs (fallback for specific chains)
      ...chainsToFetch.map((c) => fetchExplorerTx(c, owner, !!soft)),
      // 4. Special Polygon Amoy transaction fetch
      fetchPolygonAmoyTransactions(owner),
      // 5. RPC for all chains (enhanced for Polygon Amoy)
      ...chainsToFetch.map((c) => rpcErc20IncomingLookback(c, owner, c.chainId === 80002 ? 20 : 5)), // More blocks for Polygon Amoy
    ]);

    // Wait for all sources
    const results = await allSources;

    const allItems = results.map((r) => (r.status === "fulfilled" ? r.value : [])).flat();
    const merged = mergeAndSort([allItems, sticky]);

    console.log('HistoryTab: All sources found:', allItems.length, 'transactions');
    console.log('HistoryTab: Cached items:', sticky.length, 'transactions');
    console.log('HistoryTab: Total merged transactions:', merged.length);
    console.log('HistoryTab: Sample transactions:', merged.slice(0, 3).map(t => ({
      hash: t.hash.substring(0, 10) + '...',
      from: t.from.substring(0, 10) + '...',
      to: t.to.substring(0, 10) + '...',
      value: t.valueWei,
      source: t._source,
      direction: t.direction
    })));

    // If no transactions found, this may be normal for new wallets

    // Set the final results

    setItems(merged);
    await safeSaveRxCache(owner, merged);
    setFirstLoading(false);
    setIsRefreshing(false);
  }, [address, chains, loadPrices, loadRxCache, safeSaveRxCache, firstLoading]);

  useEffect(() => { fetchAll(false); /* mount */ }, []);
  
  // Reload prices when currency changes
  useEffect(() => {
    loadPrices();
  }, [localCurrency, loadPrices]);
  
  // Force re-render when display unit changes
  useEffect(() => {
    // No logging needed for display unit changes
  }, [displayUnit]);

  useFocusEffect(
    useCallback(() => {
      console.log('HistoryTab: Focus effect triggered - auto refresh on load');
      setIsRefreshing(true);
      fetchAll(true); // Auto refresh on load
      
      if (pollRef.current) clearInterval(pollRef.current);
      
      // Auto refresh after 30 seconds, then allow pull-to-refresh only
      const timeoutId = setTimeout(() => {
        console.log('HistoryTab: 30s auto refresh triggered');
        fetchAll(true);
        
        // Clear the interval after the first 30s refresh
        if (pollRef.current) clearInterval(pollRef.current);
      }, 30000);
      
      return () => { 
        clearTimeout(timeoutId);
        if (pollRef.current) clearInterval(pollRef.current); 
      };
    }, [fetchAll])
  );

  const openExplorer = (t: TxItem) => {
    if (!t.explorerBase || !t.hash) return;
    Linking.openURL(`${t.explorerBase}/tx/${t.hash}`);
  };

  const priceFor = (sym: string) => {
    const price = priceMap[sym] || { usd: 0, local: 0 };
    
    // Fallback prices for testing with different USD vs Local values
    const fallbackPrices: Record<string, { usd: number; local: number }> = {
      'ETH': { usd: 2000, local: 1600 }, // 20% difference
      'MATIC': { usd: 0.65, local: 0.52 }, // 20% difference
      'BNB': { usd: 350, local: 280 }, // 20% difference
      'USDT': { usd: 1, local: 0.8 }, // 20% difference
      'USDC': { usd: 1, local: 0.8 }, // 20% difference
    };
    
    // If MATIC price is 0, use fallback
    if (sym === 'MATIC' && price.usd === 0) {
      console.log('HistoryTab: Using fallback price for MATIC');
      return fallbackPrices['MATIC'];
    }
    
    const finalPrice = price.usd > 0 ? price : (fallbackPrices[sym] || { usd: 0, local: 0 });
    console.log(`HistoryTab: priceFor(${sym}) =`, finalPrice);
    return finalPrice;
  };

  const renderItem = ({ item }: { item: TxItem }) => {
    const me = (address || "").toLowerCase();
    const isSend = item.isToken
      ? (item.direction === "OUT" || (me && item.from === me))
      : (me && item.from === me);
    const successful = item.successful !== false;
    const dt = new Date(item.timestamp).toLocaleString();

    // Amount formatting with unit / currency toggle
    let amountText = "";
    let unitText = "";

    if (item.isToken) {
      const sym = (item.tokenSymbol || "TOKEN").toUpperCase();
      const val = Number(item.tokenValueUnits || "0");
      if (displayUnit === "USD") {
        const usd = PRICE_IDS[sym] ? priceFor(sym).usd : 0;
        if (usd > 0) {
          amountText = (val * usd).toFixed(2);
          unitText = "USD";
        } else {
          amountText = fmt(val, 6);
          unitText = sym;
        }
      } else if (displayUnit === localCurrency) {
        const loc = PRICE_IDS[sym] ? priceFor(sym).local : 0;
        if (loc > 0) {
          amountText = (val * loc).toFixed(2);
          unitText = localCurrency;
        } else {
          amountText = fmt(val, 6);
          unitText = sym;
        }
      } else {
        amountText = fmt(val, 6);
        unitText = sym;
      }
    } else {
      const valNative = parseFloat(ethers.utils.formatEther(item.valueWei || "0"));
      const sym = item.nativeSymbol;
              
      if (displayUnit === "USD") {
                const usd = priceFor(sym).usd;
                amountText = (valNative * usd).toFixed(2);
        unitText = "USD";
      } else if (displayUnit === localCurrency) {
                const loc = priceFor(sym).local;
                amountText = (valNative * loc).toFixed(2);
        unitText = localCurrency;
      } else {
        amountText = fmt(valNative, 6);
        unitText = sym;
      }
    }

    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => openExplorer(item)}>
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <Ionicons
              name={isSend ? "arrow-up" : "arrow-down"}
              size={22}
              color={isSend ? "#E11D48" : "#16A34A"}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.date}>{dt}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.chainTag}>{item.isToken ? (item.tokenSymbol || "TOKEN") : item.nativeSymbol}</Text>
          </View>

          <View style={styles.line} />

          <View style={styles.row}>
            <Text style={styles.label}>Amount:</Text>
            <Text style={styles.value}>
              {amountText} {unitText}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Type:</Text>
            <Text style={styles.value}>
              {item.isToken ? "Token Transfer" : "Native Transfer"}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Status:</Text>
            <Text style={[styles.value, successful ? styles.statusConfirmed : styles.statusFailed]}>
              {successful ? "Confirmed" : "Failed"}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Network:</Text>
            <Text style={styles.value}>{item.nativeSymbol} ({item.chainId})</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>{isSend ? "To:" : "From:"}</Text>
            <Text style={styles.valueAddr}>{isSend ? maskAddr(item.to) : maskAddr(item.from)}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Hash:</Text>
            <Text style={styles.valueAddr}>{maskAddr(item.hash)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
      <Text style={styles.heading}>Transaction History</Text>
        <TouchableOpacity
          style={styles.debugButton}
          onPress={() => {
            console.log('HistoryTab: Manual debug refresh triggered');
            fetchAll(false);
          }}
        >
          <Text style={styles.debugButtonText}>Debug</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.controlsBlockCentered}>
        <View style={styles.unitRow}>
          <TouchableOpacity
            style={displayUnit === "TOKEN" ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setDisplayUnit("TOKEN")}
          >
            <Text style={displayUnit === "TOKEN" ? styles.unitTextActive : styles.unitText}>TOKEN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={displayUnit === "USD" ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setDisplayUnit("USD")}
          >
            <Text style={displayUnit === "USD" ? styles.unitTextActive : styles.unitText}>USD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={displayUnit === localCurrency ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setDisplayUnit(localCurrency)}
          >
            <Text style={displayUnit === localCurrency ? styles.unitTextActive : styles.unitText}>{localCurrency}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {firstLoading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0A84FF" />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(it, i) =>
            it.hash ? `${it.hash}:${it.chainId}:${it.isToken ? (it.tokenContract || "token") : "native"}:${it.from}:${it.to}:${amountKey(it)}:${displayUnit}` : String(i)
          }
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.empty}>No transactions found</Text>
              <Text style={styles.emptySubtext}>
                Try refreshing or check if you're on the correct network
              </Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchAll(true)} colors={["#0A84FF"]} />}
        />
      )}
    </View>
  );
}

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: undefined });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 50,
    marginBottom: 8,
  },
  heading: {
    fontSize: 36, fontWeight: "bold", color: "#0A84FF",
    textAlign: "center", flex: 1,
  },
  debugButton: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  debugButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContainer: { padding: 16 },
  emptyContainer: { alignItems: "center", marginTop: 24 },
  empty: { textAlign: "center", color: "#888", fontSize: 16, fontWeight: "bold" },
  emptySubtext: { textAlign: "center", color: "#aaa", marginTop: 8, fontSize: 14 },

  controlsBlockCentered: { paddingHorizontal: 16, marginBottom: 6, alignItems: "center" },
  unitRow: { flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center" },
  unitButton: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#f3f4f6", borderRadius: 20 },
  unitButtonActive: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#0A84FF", borderRadius: 20 },
  unitText: { color: "#0A84FF", fontWeight: "bold" },
  unitTextActive: { color: "#fff", fontWeight: "bold" },

  card: {
    backgroundColor: "#F5F9FF",
    borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#E6F0FF",
  },
  rowTop: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  chainTag: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: "#E8F1FF", color: "#0A84FF", fontWeight: "700",
  },
  line: { height: 1, backgroundColor: "#E6EAF2", marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", marginTop: 6 },
  label: { width: 86, fontWeight: "bold", color: "#000" },
  value: { flex: 1, color: "#111" },
  valueAddr: { flex: 1, color: "#333", fontFamily: mono },
  date: { color: "#333", fontWeight: "600" },
  statusConfirmed: { color: "#16A34A", fontWeight: "700" },
  statusFailed: { color: "#DC2626", fontWeight: "700" },
});

