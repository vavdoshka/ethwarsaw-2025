export type WalletType = 'phantom' | 'metamask';

export type ChainType = 'solana' | 'sheet chain';

export interface WalletInfo {
  name: string;
  icon: string;
  type: WalletType;
  chain: ChainType;
}

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
