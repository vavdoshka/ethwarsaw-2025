import type { Chain } from './types';

export const CHAINS: Chain[] = [
  {
    id: 0,
    name: 'sheet chain',
    display_name: 'Sheet Chain',
    icon: '/sheet.svg',
    tokens: [
      {
        symbol: 'SHEET',
        name: 'Native Sheet',
        icon: '/sheet.svg',
      },
    ],
  },
  {
    id: 1,
    name: 'solana',
    display_name: 'Solana',
    icon: '/solana.svg',
    tokens: [
      {
        symbol: 'SHEET',
        name: 'Solana Sheet Coin',
        icon: '/sheet_sol.svg',
      },
    ],
  },
  {
    id: 2,
    name: 'bsc',
    display_name: 'Binance Smart Chain',
    icon: '/bsc.svg',
    tokens: [
      {
        symbol: 'SHEET',
        name: 'BSC Sheet Coin',
        icon: '/sheet_bsc.svg',
      },
    ],
  },
];

export const IS_MAINNET = false;

export const SOL_RPC_ENDPOINT = 'https://api.devnet.solana.com';
export const SOL_SHEET_MINT_ADDRESS =
  'CpsKSnkJXrgxUXjJjqLR9tn3QM9RrVASHjA8LW97XHo3';
export const SOL_SHEET_BRIDGE_PROGRAM_ID =
  '46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx';

export const SHEET_RPC_ENDPOINT = 'http://localhost:8545';

export const BSC_RPC_ENDPOINT = 'https://bsc-dataseed.binance.org';
export const BSC_SHEET_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000'; // TODO: Replace with actual BSC SHEET token address
