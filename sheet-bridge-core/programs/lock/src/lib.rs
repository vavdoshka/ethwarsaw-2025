use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx");

#[program]
pub mod lock {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let lock_account = &mut ctx.accounts.lock_account;
        lock_account.mint = ctx.accounts.mint.key();
        Ok(())
    }

    pub fn lock_tokens(ctx: Context<LockTokens>, amount: u64, recipient: String) -> Result<()> {
        // Basic recipient format validation (Ethereum-style 0x + 40 hex chars)
        require!(is_valid_eth_address(&recipient), LockError::InvalidRecipient);

        // Transfer user's tokens to the program vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        emit!(TokensLocked {
            sender: ctx.accounts.user.key(),
            amount,
            recipient,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// PDA storing config
    #[account(
        init,
        payer = payer,
        space = 8 + LockAccount::SIZE,
        seeds = [b"lock", mint.key().as_ref()],
        bump
    )]
    pub lock_account: Account<'info, LockAccount>,

    pub mint: Account<'info, Mint>,

    #[account(seeds = [b"vault", lock_account.key().as_ref()], bump)]
    /// CHECK: This is a program-derived address derived as seeds = [b"vault", lock_account.key().as_ref()].
    /// It only serves as the authority/owner for the vault token account created or used by this program.
    /// No lamports or data are read or written on this account directly.
    pub vault_authority: UncheckedAccount<'info>,

    /// Program-owned ATA that will hold locked tokens
    #[account(
        init,
        payer = payer,
        associated_token::authority = vault_authority,
        associated_token::mint = mint
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct LockTokens<'info> {
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"lock", mint.key().as_ref()],
        bump,
        has_one = mint
    )]
    pub lock_account: Account<'info, LockAccount>,

    pub mint: Account<'info, Mint>,

    /// User source token account; must match configured mint and user owner
    #[account(
        mut,
        constraint = user_token_account.mint == lock_account.mint @ LockError::InvalidMint,
        constraint = user_token_account.owner == user.key() @ LockError::InvalidOwner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_token_account.mint == lock_account.mint @ LockError::InvalidMint,
        constraint = vault_token_account.owner == vault_authority.key() @ LockError::InvalidVault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(seeds = [b"vault", lock_account.key().as_ref()], bump)]
    /// CHECK: This is a program-derived address derived as seeds = [b"vault", lock_account.key().as_ref()].
    /// It only serves as the authority/owner for the vault token account.
    /// No lamports or data are read or written on this account directly.
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct LockAccount {
    pub mint: Pubkey,
}

impl LockAccount {
    pub const SIZE: usize = 32;
}

#[event]
pub struct TokensLocked {
    pub sender: Pubkey,
    pub amount: u64,
    pub recipient: String,
}

#[error_code]
pub enum LockError {
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Invalid source owner")]
    InvalidOwner,
    #[msg("Invalid vault token account")]
    InvalidVault,
    #[msg("Invalid recipient address")]
    InvalidRecipient,
}

fn is_valid_eth_address(s: &str) -> bool {
    if s.len() != 42 { return false; }
    if !s.starts_with("0x") { return false; }
    s.as_bytes()[2..].iter().all(|c| matches!(c,
        b'0'..=b'9' | b'a'..=b'f' | b'A'..=b'F'
    ))
}
