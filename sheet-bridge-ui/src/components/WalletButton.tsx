import React from 'react';

interface WalletButtonProps {
  onClick: () => void;
  connected: boolean;
  address?: string;
}

export const WalletButton: React.FC<WalletButtonProps> = ({
  onClick,
  connected,
  address,
}) => {
  const buttonStyles =
    'inline-flex items-center justify-center h-full px-6 min-w-[150px] text-sm font-medium bg-[#00c853] hover:bg-[#00b64f] text-white transition-colors duration-200 cursor-pointer rounded-none';

  return (
    <button onClick={onClick} type="button" className={buttonStyles}>
      {connected && address ? address : 'Connect Wallet'}
    </button>
  );
};
