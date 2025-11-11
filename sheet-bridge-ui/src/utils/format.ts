export const formatAddress = (
  address: string,
  startChars = 6,
  endChars = 4
): string => {
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

export const isValidAmount = (value: string): boolean => {
  return /^\d*\.?\d*$/.test(value);
};

/**
 * Validates an Ethereum address (0x followed by 40 hex characters)
 */
export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validates a Solana address (base58 encoded, 32-44 characters)
 * Solana addresses use base58 encoding: 1-9, A-H, J-N, P-Z, a-k, m-z (excluding 0, O, I, l)
 */
export const isValidSolanaAddress = (address: string): boolean => {
  // Solana addresses are base58 encoded and typically 32-44 characters
  // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
};

/**
 * Validates an address based on the chain type
 */
export const isValidAddress = (address: string, chainName: string): boolean => {
  if (!address || address.trim() === '') return false;
  
  const trimmedAddress = address.trim();
  
  if (chainName.toLowerCase() === 'solana') {
    return isValidSolanaAddress(trimmedAddress);
  } else {
    // For Ethereum-based chains (Sheet Chain, etc.)
    return isValidEthereumAddress(trimmedAddress);
  }
};
