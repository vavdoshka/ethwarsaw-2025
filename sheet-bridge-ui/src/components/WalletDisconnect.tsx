import React, { useState, useRef, useEffect } from 'react';

interface WalletDisconnectProps {
  address: string;
  onDisconnect: () => void;
}

export const WalletDisconnect: React.FC<WalletDisconnectProps> = ({
  address,
  onDisconnect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative h-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        className="inline-flex items-center justify-center gap-2 h-full px-6 min-w-[150px] text-sm font-medium bg-[#00c853] hover:bg-[#00b64f] text-white transition-colors duration-200 cursor-pointer rounded-none"
      >
        <span>{address}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="9 6 6 9 3 6"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-white/[0.15] shadow-lg z-50">
          <div className="py-1">
            <button
              onClick={() => {
                onDisconnect();
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/5 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
