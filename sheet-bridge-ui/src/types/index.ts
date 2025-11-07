export type WalletType = 'phantom' | 'metamask';

export type ChainType = 'solana' | 'sheet chain' | 'bsc';

export type Chain = {
  id: number;
  name: ChainType;
  icon?: string;
  tokens: Token[];
};

export type Token = {
  symbol: string;
  name: string;
  address?: string;
  icon?: string;
};
