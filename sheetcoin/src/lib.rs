//!
//! SheetCoin ERC20 Token
//!
//! This contract implements the ERC-20 standard for fungible tokens.
//! It provides all the standard ERC-20 methods including transfer, approve, and allowance.
//!
//! The program is ABI-equivalent with Solidity, which means you can call it from both Solidity and Rust.
//! To do this, run `cargo stylus export-abi`.
//!
//! Note: this code is a template-only and has not been audited.
//!
// Allow `cargo stylus export-abi` to generate a main function.
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use stylus_sdk::{
    evm,
    prelude::*,
};

// Include the ERC20 implementation
mod erc20;
use erc20::{Erc20, Erc20Params};

// Define the parameters for our SheetCoin token
pub struct SheetCoinParams;

impl Erc20Params for SheetCoinParams {
    const NAME: &'static str = "SheetCoin";
    const SYMBOL: &'static str = "SHEET";
    const DECIMALS: u8 = 18;
}

// Define the main contract storage
sol_storage! {
    #[entrypoint]
    pub struct SheetCoin {
        #[borrow]
        Erc20<SheetCoinParams> erc20;
        /// Contract owner who can mint tokens
        address owner;
    }
}

// Declare events and Solidity error types
sol! {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnerChanged(address indexed old_owner, address indexed new_owner);
    
    error OnlyOwner(address caller, address owner);
}

/// Represents the ways methods may fail.
#[derive(SolidityError)]
pub enum SheetCoinError {
    InsufficientBalance(erc20::InsufficientBalance),
    InsufficientAllowance(erc20::InsufficientAllowance),
    OnlyOwner(OnlyOwner),
}

impl From<erc20::Erc20Error> for SheetCoinError {
    fn from(err: erc20::Erc20Error) -> Self {
        match err {
            erc20::Erc20Error::InsufficientBalance(e) => SheetCoinError::InsufficientBalance(e),
            erc20::Erc20Error::InsufficientAllowance(e) => SheetCoinError::InsufficientAllowance(e),
        }
    }
}

/// Declare that `SheetCoin` is a contract with the following external methods.
#[public]
impl SheetCoin {
    /// Initialize the contract - sets the caller as the owner (can only be called once)
    pub fn initialize(&mut self) -> Result<(), SheetCoinError> {
        let current_owner = self.owner.get();
        if current_owner != Address::ZERO {
            return Err(SheetCoinError::OnlyOwner(OnlyOwner {
                caller: self.vm().msg_sender(),
                owner: current_owner,
            }));
        }
        
        self.owner.set(self.vm().msg_sender());
        Ok(())
    }

    /// Returns the current owner
    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    /// Transfers ownership to a new address
    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), SheetCoinError> {
        let current_owner = self.owner.get();
        if current_owner != self.vm().msg_sender() {
            return Err(SheetCoinError::OnlyOwner(OnlyOwner {
                caller: self.vm().msg_sender(),
                owner: current_owner,
            }));
        }
        
        self.owner.set(new_owner);
        evm::log(OwnerChanged {
            old_owner: current_owner,
            new_owner,
        });
        
        Ok(())
    }
    /// Immutable token name
    pub fn name() -> String {
        Erc20::<SheetCoinParams>::name()
    }

    /// Immutable token symbol
    pub fn symbol() -> String {
        Erc20::<SheetCoinParams>::symbol()
    }

    /// Immutable token decimals
    pub fn decimals() -> u8 {
        Erc20::<SheetCoinParams>::decimals()
    }

    /// Total supply of tokens
    pub fn total_supply(&self) -> U256 {
        self.erc20.total_supply()
    }

    /// Balance of `address`
    pub fn balance_of(&self, owner: Address) -> U256 {
        self.erc20.balance_of(owner)
    }

    /// Transfers `value` tokens from msg::sender() to `to`
    pub fn transfer(&mut self, to: Address, value: U256) -> Result<bool, SheetCoinError> {
        Ok(self.erc20.transfer(to, value)?)
    }

    /// Transfers `value` tokens from `from` to `to`
    pub fn transfer_from(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
    ) -> Result<bool, SheetCoinError> {
        Ok(self.erc20.transfer_from(from, to, value)?)
    }

    /// Approves the spenditure of `value` tokens of msg::sender() to `spender`
    pub fn approve(&mut self, spender: Address, value: U256) -> bool {
        self.erc20.approve(spender, value)
    }

    /// Returns the allowance of `spender` on `owner`'s tokens
    pub fn allowance(&self, owner: Address, spender: Address) -> U256 {
        self.erc20.allowance(owner, spender)
    }

    /// Mints `value` tokens to `address` (only owner can mint)
    pub fn mint(&mut self, address: Address, value: U256) -> bool {
        let current_owner = self.owner.get();
        if current_owner != self.vm().msg_sender() {
            panic!("OnlyOwner");
        }
        
        match self.erc20.mint(address, value) {
            Ok(_) => true,
            Err(_) => panic!("Mint failed"),
        }
    }

    /// Burns `value` tokens from `address`
    pub fn burn(&mut self, address: Address, value: U256) -> bool {
        match self.erc20.burn(address, value) {
            Ok(_) => true,
            Err(_) => panic!("Burn failed"),
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use alloy_primitives::address;
    use stylus_sdk::testing::*;

    #[test]
    fn test_erc20_basic_operations() {
        let vm = TestVM::default();
        let mut contract = SheetCoin::from(&vm);
        
        let alice = address!("0x1234567890123456789012345678901234567890");
        let bob = address!("0x0987654321098765432109876543210987654321");
        
        // Test initial state
        assert_eq!(contract.total_supply(), U256::ZERO);
        assert_eq!(contract.balance_of(alice), U256::ZERO);
        assert_eq!(contract.balance_of(bob), U256::ZERO);
        
        // Test minting
        let mint_amount = U256::from(1000);
        contract.mint(alice, mint_amount).unwrap();
        assert_eq!(contract.total_supply(), mint_amount);
        assert_eq!(contract.balance_of(alice), mint_amount);
        
        // Test transfer
        let transfer_amount = U256::from(100);
        contract.transfer(bob, transfer_amount).unwrap();
        assert_eq!(contract.balance_of(alice), mint_amount - transfer_amount);
        assert_eq!(contract.balance_of(bob), transfer_amount);
        
        // Test approval and transfer_from
        let approve_amount = U256::from(50);
        contract.approve(bob, approve_amount);
        assert_eq!(contract.allowance(alice, bob), approve_amount);
        
        // Test burning
        let burn_amount = U256::from(200);
        contract.burn(alice, burn_amount).unwrap();
        assert_eq!(contract.balance_of(alice), mint_amount - transfer_amount - burn_amount);
        assert_eq!(contract.total_supply(), mint_amount - burn_amount);
    }
    
    #[test]
    fn test_erc20_metadata() {
        assert_eq!(SheetCoin::name(), "SheetCoin");
        assert_eq!(SheetCoin::symbol(), "SHEET");
        assert_eq!(SheetCoin::decimals(), 18);
    }
}
