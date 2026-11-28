use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{PlatformConfig, RooficError, CONFIG_SEED};

/// Vault reserve state following the simple_vault template pattern:
/// tracks total deposited tokens and total issued reserve shares.
#[account]
#[derive(InitSpace)]
pub struct ReserveVault {
    pub admin: Pubkey,
    pub token_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub total_tokens: u64,
    pub total_shares: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitializeReserveVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ RooficError::NotAdmin,
    )]
    pub config: Account<'info, PlatformConfig>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = 8 + ReserveVault::INIT_SPACE,
        seeds = [b"reserve_vault", token_mint.key().as_ref()],
        bump,
    )]
    pub reserve_vault: Account<'info, ReserveVault>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = reserve_vault,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositReserve<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"reserve_vault", reserve_vault.token_mint.as_ref()],
        bump = reserve_vault.bump,
    )]
    pub reserve_vault: Account<'info, ReserveVault>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        address = reserve_vault.vault_token_account,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawReserve<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"reserve_vault", reserve_vault.token_mint.as_ref()],
        bump = reserve_vault.bump,
    )]
    pub reserve_vault: Account<'info, ReserveVault>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        address = reserve_vault.vault_token_account,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn initialize_reserve_vault_handler(ctx: Context<InitializeReserveVault>) -> Result<()> {
    let vault = &mut ctx.accounts.reserve_vault;
    vault.admin = ctx.accounts.admin.key();
    vault.token_mint = ctx.accounts.token_mint.key();
    vault.vault_token_account = ctx.accounts.vault_token_account.key();
    vault.total_tokens = 0;
    vault.total_shares = 0;
    vault.bump = ctx.bumps.reserve_vault;
    Ok(())
}

/// Deposit `amount` tokens into the reserve vault and compute proportional shares:
///   First deposit:       shares = amount (1:1)
///   Subsequent deposits: shares = amount * total_shares / total_tokens
pub fn deposit_reserve_handler(ctx: Context<DepositReserve>, amount: u64) -> Result<u64> {
    require!(amount > 0, RooficError::InvalidAmount);

    let vault = &ctx.accounts.reserve_vault;
    let shares = if vault.total_shares == 0 || vault.total_tokens == 0 {
        amount
    } else {
        (amount as u128)
            .checked_mul(vault.total_shares as u128)
            .and_then(|v| v.checked_div(vault.total_tokens as u128))
            .and_then(|v| u64::try_from(v).ok())
            .ok_or(RooficError::MathOverflow)?
    };

    require!(shares > 0, RooficError::SharesTooSmall);

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_token_account.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.token_mint.decimals,
    )?;

    let vault = &mut ctx.accounts.reserve_vault;
    vault.total_tokens = vault.total_tokens.checked_add(amount).ok_or(RooficError::MathOverflow)?;
    vault.total_shares = vault.total_shares.checked_add(shares).ok_or(RooficError::MathOverflow)?;

    Ok(shares)
}

/// Withdraw tokens from the reserve vault proportional to `shares_amount`:
///   tokens_out = shares_amount * total_tokens / total_shares
pub fn withdraw_reserve_handler(ctx: Context<WithdrawReserve>, shares_amount: u64) -> Result<u64> {
    require!(shares_amount > 0, RooficError::InvalidAmount);

    let vault = &ctx.accounts.reserve_vault;
    require!(vault.total_shares > 0 && shares_amount <= vault.total_shares, RooficError::NotEnoughShares);

    let tokens_out = (shares_amount as u128)
        .checked_mul(vault.total_tokens as u128)
        .and_then(|v| v.checked_div(vault.total_shares as u128))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(RooficError::MathOverflow)?;

    require!(tokens_out > 0, RooficError::InvalidAmount);

    let token_mint_key = vault.token_mint;
    let seeds = &[b"reserve_vault".as_ref(), token_mint_key.as_ref(), &[vault.bump]];
    let signer = &[&seeds[..]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.reserve_vault.to_account_info(),
            },
            signer,
        ),
        tokens_out,
        ctx.accounts.token_mint.decimals,
    )?;

    let vault = &mut ctx.accounts.reserve_vault;
    vault.total_tokens = vault.total_tokens.checked_sub(tokens_out).ok_or(RooficError::MathOverflow)?;
    vault.total_shares = vault.total_shares.checked_sub(shares_amount).ok_or(RooficError::MathOverflow)?;

    Ok(tokens_out)
}
