/**
 * Comprehensive Network Transaction Testing
 * Tests transaction detection across all supported networks
 */

import { CHAINS } from '../../config/chainRegistry';

// Test configuration
const TEST_CONFIG = {
  // Test wallet addresses (replace with your test addresses)
  testAddresses: {
    sepolia: "0x064A0456d03aaF314b48394391565362B179E9A1",
    polygonAmoy: "0x064A0456d03aaF314b48394391565362B179E9A1",
    bscTestnet: "0x064A0456d03aaF314b48394391565362B179E9A1",
  },
  
  // API endpoints to test
  explorerAPIs: {
    etherscan: "https://api-sepolia.etherscan.io/api",
    polygonscan: "https://api-amoy.polygonscan.com/api", 
    bscscan: "https://api-testnet.bscscan.com/api",
  },
  
  // RPC endpoints to test
  rpcEndpoints: {
    sepolia: "https://eth-sepolia.g.alchemy.com/v2/alcht_uv4juP2GrHsvgb63E8yNXAhCWicWBj",
    polygonAmoy: "https://rpc-amoy.polygon.technology",
    bscTestnet: "https://bsc-testnet.publicnode.com",
  }
};

// Test results interface
interface TestResult {
  network: string;
  chainId: number;
  testType: 'explorer' | 'rpc' | 'covalent';
  success: boolean;
  error?: string;
  responseTime?: number;
  transactionCount?: number;
}

// Test results storage
const testResults: TestResult[] = [];

/**
 * Test Explorer API connectivity
 */
async function testExplorerAPI(chain: any, address: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    let apiUrl = '';
    let apiKey = '';
    
    // Configure API based on chain
    if (chain.chainId === 11155111) { // Sepolia
      apiUrl = `${TEST_CONFIG.explorerAPIs.etherscan}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=10&apikey=3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M`;
    } else if (chain.chainId === 80002) { // Polygon Amoy
      apiUrl = `${TEST_CONFIG.explorerAPIs.polygonscan}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=10&apikey=3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M`;
    } else if (chain.chainId === 97) { // BSC Testnet
      apiUrl = `${TEST_CONFIG.explorerAPIs.bscscan}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=10&apikey=3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M`;
    } else {
      return {
        network: chain.name,
        chainId: chain.chainId,
        testType: 'explorer',
        success: false,
        error: 'No explorer API configured for this chain'
      };
    }
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    const responseTime = Date.now() - startTime;
    
    if (data.status === '1' && Array.isArray(data.result)) {
      return {
        network: chain.name,
        chainId: chain.chainId,
        testType: 'explorer',
        success: true,
        responseTime,
        transactionCount: data.result.length
      };
    } else {
      return {
        network: chain.name,
        chainId: chain.chainId,
        testType: 'explorer',
        success: false,
        error: data.message || 'API returned error status'
      };
    }
  } catch (error) {
    return {
      network: chain.name,
      chainId: chain.chainId,
      testType: 'explorer',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test RPC connectivity
 */
async function testRPCConnection(chain: any): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const rpcUrl = chain.rpcUrls?.[0];
    if (!rpcUrl) {
      return {
        network: chain.name,
        chainId: chain.chainId,
        testType: 'rpc',
        success: false,
        error: 'No RPC URL configured'
      };
    }
    
    // Test RPC connectivity by getting latest block
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1
      })
    });
    
    const data = await response.json();
    const responseTime = Date.now() - startTime;
    
    if (data.result) {
      return {
        network: chain.name,
        chainId: chain.chainId,
        testType: 'rpc',
        success: true,
        responseTime
      };
    } else {
      return {
        network: chain.name,
        chainId: chain.chainId,
        testType: 'rpc',
        success: false,
        error: 'RPC returned error'
      };
    }
  } catch (error) {
    return {
      network: chain.name,
      chainId: chain.chainId,
      testType: 'rpc',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test Covalent API connectivity
 */
async function testCovalentAPI(chain: any, address: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const covalentUrl = `https://api.covalenthq.com/v1/${chain.covalentChainId}/address/${address}/transactions_v3/?no-logs=true&page-size=10&key=cqt_rQhXcTB97PBwq7HC3GgcWfR8XYHv`;
    
    const response = await fetch(covalentUrl);
    const data = await response.json();
    const responseTime = Date.now() - startTime;
    
    if (data.data && Array.isArray(data.data.items)) {
      return {
        network: chain.name,
        chainId: chain.chainId,
        testType: 'covalent',
        success: true,
        responseTime,
        transactionCount: data.data.items.length
      };
    } else {
      return {
        network: chain.name,
        chainId: chain.chainId,
        testType: 'covalent',
        success: false,
        error: 'Covalent API returned no data'
      };
    }
  } catch (error) {
    return {
      network: chain.name,
      chainId: chain.chainId,
      testType: 'covalent',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Run comprehensive network tests
 */
export async function runNetworkTests(): Promise<TestResult[]> {
  console.log('🧪 Starting Comprehensive Network Tests');
  console.log('=' .repeat(50));
  
  const testnetChains = CHAINS.filter(chain => chain.testnet);
  const mainnetChains = CHAINS.filter(chain => !chain.testnet);
  
  console.log(`📊 Testing ${CHAINS.length} networks:`);
  console.log(`   🔬 Testnets: ${testnetChains.length}`);
  console.log(`   🌐 Mainnets: ${mainnetChains.length}`);
  console.log('');
  
  // Test testnet chains first (safer)
  console.log('🔬 TESTING TESTNET CHAINS:');
  for (const chain of testnetChains) {
    console.log(`\n📡 Testing ${chain.name} (${chain.nativeSymbol}) - Chain ID: ${chain.chainId}`);
    
    const testAddress = TEST_CONFIG.testAddresses.sepolia; // Use same address for all tests
    
    // Test Explorer API
    console.log('   🔍 Testing Explorer API...');
    const explorerResult = await testExplorerAPI(chain, testAddress);
    testResults.push(explorerResult);
    console.log(`   ${explorerResult.success ? '✅' : '❌'} Explorer API: ${explorerResult.success ? 'SUCCESS' : explorerResult.error}`);
    
    // Test RPC
    console.log('   🔗 Testing RPC Connection...');
    const rpcResult = await testRPCConnection(chain);
    testResults.push(rpcResult);
    console.log(`   ${rpcResult.success ? '✅' : '❌'} RPC: ${rpcResult.success ? 'SUCCESS' : rpcResult.error}`);
    
    // Test Covalent (if supported)
    if (chain.covalentSupported) {
      console.log('   🌐 Testing Covalent API...');
      const covalentResult = await testCovalentAPI(chain, testAddress);
      testResults.push(covalentResult);
      console.log(`   ${covalentResult.success ? '✅' : '❌'} Covalent: ${covalentResult.success ? 'SUCCESS' : covalentResult.error}`);
    }
  }
  
  console.log('\n🌐 TESTING MAINNET CHAINS:');
  for (const chain of mainnetChains) {
    console.log(`\n📡 Testing ${chain.name} (${chain.nativeSymbol}) - Chain ID: ${chain.chainId}`);
    
    const testAddress = TEST_CONFIG.testAddresses.sepolia; // Use same address for all tests
    
    // Test RPC only for mainnets (safer)
    console.log('   🔗 Testing RPC Connection...');
    const rpcResult = await testRPCConnection(chain);
    testResults.push(rpcResult);
    console.log(`   ${rpcResult.success ? '✅' : '❌'} RPC: ${rpcResult.success ? 'SUCCESS' : rpcResult.error}`);
    
    // Test Covalent (if supported)
    if (chain.covalentSupported) {
      console.log('   🌐 Testing Covalent API...');
      const covalentResult = await testCovalentAPI(chain, testAddress);
      testResults.push(covalentResult);
      console.log(`   ${covalentResult.success ? '✅' : '❌'} Covalent: ${covalentResult.success ? 'SUCCESS' : covalentResult.error}`);
    }
  }
  
  // Generate test report
  console.log('\n📊 TEST RESULTS SUMMARY:');
  console.log('=' .repeat(50));
  
  const successfulTests = testResults.filter(r => r.success).length;
  const totalTests = testResults.length;
  const successRate = (successfulTests / totalTests * 100).toFixed(1);
  
  console.log(`✅ Successful Tests: ${successfulTests}/${totalTests} (${successRate}%)`);
  console.log('');
  
  // Group results by network
  const resultsByNetwork = testResults.reduce((acc, result) => {
    if (!acc[result.network]) acc[result.network] = [];
    acc[result.network].push(result);
    return acc;
  }, {} as Record<string, TestResult[]>);
  
  console.log('📋 DETAILED RESULTS BY NETWORK:');
  for (const [network, results] of Object.entries(resultsByNetwork)) {
    console.log(`\n🌐 ${network}:`);
    for (const result of results) {
      const status = result.success ? '✅' : '❌';
      const details = result.success 
        ? `(${result.responseTime}ms${result.transactionCount ? `, ${result.transactionCount} txs` : ''})`
        : `(${result.error})`;
      console.log(`   ${status} ${result.testType.toUpperCase()}: ${details}`);
    }
  }
  
  console.log('\n🎯 KEY FINDINGS:');
  
  // Check critical networks
  const polygonAmoyResults = resultsByNetwork['Polygon Amoy'] || [];
  const sepoliaResults = resultsByNetwork['Sepolia'] || [];
  const bscTestnetResults = resultsByNetwork['BSC Testnet'] || [];
  
  console.log(`\n🔍 CRITICAL NETWORKS:`);
  console.log(`   Polygon Amoy (MATIC): ${polygonAmoyResults.some(r => r.success) ? '✅ WORKING' : '❌ FAILING'}`);
  console.log(`   Sepolia (ETH): ${sepoliaResults.some(r => r.success) ? '✅ WORKING' : '❌ FAILING'}`);
  console.log(`   BSC Testnet (BNB): ${bscTestnetResults.some(r => r.success) ? '✅ WORKING' : '❌ FAILING'}`);
  
  // Performance analysis
  const avgResponseTime = testResults
    .filter(r => r.success && r.responseTime)
    .reduce((sum, r) => sum + (r.responseTime || 0), 0) / testResults.filter(r => r.success && r.responseTime).length;
  
  console.log(`\n⚡ PERFORMANCE:`);
  console.log(`   Average Response Time: ${avgResponseTime ? avgResponseTime.toFixed(0) + 'ms' : 'N/A'}`);
  
  // Recommendations
  console.log(`\n💡 RECOMMENDATIONS:`);
  const failingNetworks = Object.entries(resultsByNetwork)
    .filter(([_, results]) => !results.some(r => r.success))
    .map(([network, _]) => network);
  
  if (failingNetworks.length > 0) {
    console.log(`   ❌ Failing Networks: ${failingNetworks.join(', ')}`);
    console.log(`   🔧 Check API keys and RPC endpoints for these networks`);
  } else {
    console.log(`   ✅ All networks are working correctly!`);
  }
  
  console.log('\n🚀 TESTING COMPLETE!');
  
  return testResults;
}

// Export for use in other test files
export type { TestResult };
export { testResults };
