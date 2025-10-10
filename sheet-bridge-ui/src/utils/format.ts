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
