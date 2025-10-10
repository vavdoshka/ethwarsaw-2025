import type { Chain, WalletInfo } from './types';

export const WALLETS: WalletInfo[] = [
  {
    name: 'Phantom',
    icon: '/phantom.svg',
    type: 'phantom',
    chain: 'solana',
  },
  {
    name: 'MetaMask',
    icon: '/metamask.svg',
    type: 'metamask',
    chain: 'sheet chain',
  },
];

export const CHAINS: Chain[] = [
  {
    id: 0,
    name: 'sheet chain',
    icon: '/sheet.svg',
    tokens: [
      {
        symbol: 'SHEET',
        name: 'Sheet Coin',
        icon: '/sheet.svg',
      },
    ],
  },
  {
    id: 1,
    name: 'solana',
    icon: '/solana.svg',
    tokens: [
      {
        symbol: 'SHEET',
        name: 'Solana Sheet Coin',
        icon: '/sheet_sol.svg',
      },
    ],
  },
];

export const SOL_RPC_ENDPOINT = 'https://api.devnet.solana.com';
export const SOL_SHEET_MINT_ADDRESS =
  'CpsKSnkJXrgxUXjJjqLR9tn3QM9RrVASHjA8LW97XHo3';
export const SOL_SHEET_BRIDGE_PROGRAM_ID =
  '46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx';

export const SHEET_RPC_ENDPOINT = 'https://eth.llamarpc.com';
