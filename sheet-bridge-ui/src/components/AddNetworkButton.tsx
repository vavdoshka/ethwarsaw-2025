import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { addSheetChainToMetaMask } from '../utils/metamask';

export const AddNetworkButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isMetaMaskAvailable, setIsMetaMaskAvailable] = useState(false);

  useEffect(() => {
    // Check if MetaMask is available
    const checkMetaMask = () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        setIsMetaMaskAvailable(true);
      }
    };
    
    checkMetaMask();
    // Also check after a short delay in case MetaMask loads asynchronously
    const timer = setTimeout(checkMetaMask, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleAddNetwork = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      toast.error('MetaMask is not installed. Please install MetaMask to continue.');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Adding SheetChain network to MetaMask...');

    try {
      await addSheetChainToMetaMask();
      toast.success('SheetChain network added successfully!', { id: toastId });
    } catch (error: any) {
      // Check if it's the "network already exists" error
      if (error.message?.includes('already exists')) {
        toast.error(
          () => (
            <div>
              <div className="font-semibold">Network Already Exists</div>
              <div className="text-sm text-gray-300 mt-1">
                Please remove SheetChain from MetaMask settings and try again to update the RPC URL.
              </div>
            </div>
          ),
          { id: toastId, duration: 8000 }
        );
      } else {
        toast.error(error.message || 'Failed to add network', { id: toastId });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Only show button if MetaMask is available
  if (!isMetaMaskAvailable) {
    return null;
  }

  return (
    <button
      onClick={handleAddNetwork}
      disabled={isLoading}
      type="button"
      className="inline-flex items-center justify-center gap-2 h-full px-4 text-sm font-medium bg-[#f6851b]/10 hover:bg-[#f6851b]/20 border border-[#f6851b]/30 text-white transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-none"
      title="Add SheetChain network to MetaMask"
    >
      <img
        src="/metamask.svg"
        alt="MetaMask"
        className="w-5 h-5 flex-shrink-0"
        onError={(e) => {
          // Fallback if image fails to load
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <span className="hidden sm:inline whitespace-nowrap">
        {isLoading ? 'Adding...' : 'Add SheetChain Network'}
      </span>
      <span className="sm:hidden">
        {isLoading ? '...' : 'Add'}
      </span>
    </button>
  );
};
