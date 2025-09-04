import { useState } from 'react';
import { ChainKey, chains } from '../config/chains';

export function useChain() {
  const [currentChain, setCurrentChain] = useState<ChainKey>('eth');  // Default to ETH
  return { currentChain, setCurrentChain, chains };
}