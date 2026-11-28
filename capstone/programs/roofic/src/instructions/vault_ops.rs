use anchor_lang::prelude::*;

use crate::RooficError;

/// Calculates proportional reserve vault shares following the `simple_vault` template:
///   - First deposit:       shares = amount (1:1)
///   - Subsequent deposits: shares = amount * total_shares / total_tokens
pub fn calculate_deposit_shares(amount: u64, total_tokens: u64, total_shares: u64) -> Result<u64> {
    require!(amount > 0, RooficError::InvalidAmount);

    let shares = if total_shares == 0 || total_tokens == 0 {
        amount
    } else {
        (amount as u128)
            .checked_mul(total_shares as u128)
            .and_then(|v| v.checked_div(total_tokens as u128))
            .and_then(|v| u64::try_from(v).ok())
            .ok_or(RooficError::MathOverflow)?
    };

    require!(shares > 0, RooficError::SharesTooSmall);
    Ok(shares)
}

/// Calculates underlying tokens returned when redeeming `shares_amount`:
///   tokens_out = shares_amount * total_tokens / total_shares
pub fn calculate_withdraw_tokens(shares_amount: u64, total_tokens: u64, total_shares: u64) -> Result<u64> {
    require!(shares_amount > 0, RooficError::InvalidAmount);
    require!(total_shares > 0 && shares_amount <= total_shares, RooficError::NotEnoughShares);

    let tokens_out = (shares_amount as u128)
        .checked_mul(total_tokens as u128)
        .and_then(|v| v.checked_div(total_shares as u128))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(RooficError::MathOverflow)?;

    require!(tokens_out > 0, RooficError::InvalidAmount);
    Ok(tokens_out)
}
