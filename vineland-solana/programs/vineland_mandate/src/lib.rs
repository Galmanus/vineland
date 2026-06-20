// Vineland — bound-mandate agent payments on Solana (Anchor).
//
// Ports the Stellar "proven bounded autonomy" moat: an agent can pay ONLY within
// rules the owner set once — per-payment cap, monthly cap, an allowlist of
// recipients — and anything outside locks. Non-custodial: funds move from the
// owner's token account via an SPL delegate the owner approves to the mandate PDA;
// the program authorizes a transfer only when every rule passes (fail-closed).
//
// USDC is an SPL token. Amounts are in token base units (USDC = 6 decimals).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("CmDKY8MxCWkCN9etSeKApHKnGuTKK6vn7qzhTkAtM9Bv");

const MAX_ALLOWED: usize = 8;

#[program]
pub mod vineland_mandate {
    use super::*;

    /// Owner creates a mandate that delegates bounded spend to `agent`.
    pub fn init_mandate(
        ctx: Context<InitMandate>,
        agent: Pubkey,
        per_payment_cap: u64,
        monthly_cap: u64,
        period_secs: i64,
        allowed: Vec<Pubkey>,
    ) -> Result<()> {
        require!(allowed.len() <= MAX_ALLOWED, MandateError::TooManyRecipients);
        require!(per_payment_cap > 0 && monthly_cap >= per_payment_cap, MandateError::BadCaps);
        require!(period_secs > 0, MandateError::BadPeriod);

        let m = &mut ctx.accounts.mandate;
        m.owner = ctx.accounts.owner.key();
        m.agent = agent;
        m.mint = ctx.accounts.mint.key();
        m.per_payment_cap = per_payment_cap;
        m.monthly_cap = monthly_cap;
        m.period_secs = period_secs;
        m.period_start = Clock::get()?.unix_timestamp;
        m.spent_in_period = 0;
        m.paused = false;
        m.allowed = allowed;
        m.bump = ctx.bumps.mandate;
        Ok(())
    }

    /// Agent executes a bounded charge to an allowlisted recipient.
    /// Fail-closed: paused, over per-payment cap, over monthly cap, or recipient
    /// not on the allowlist → reverts. Rolls the period when elapsed.
    pub fn charge(ctx: Context<Charge>, amount: u64) -> Result<()> {
        // ---- checks (immutable read of the mandate) ----
        let recipient_owner = ctx.accounts.recipient_token.owner;
        let (owner_key, mint_key, bump);
        let new_spent;
        let now = Clock::get()?.unix_timestamp;
        let period_elapsed;
        {
            let m = &ctx.accounts.mandate;
            require!(!m.paused, MandateError::Paused);
            require_keys_eq!(ctx.accounts.agent.key(), m.agent, MandateError::NotAgent);
            require!(amount > 0 && amount <= m.per_payment_cap, MandateError::OverPerPaymentCap);
            require!(m.allowed.contains(&recipient_owner), MandateError::RecipientNotAllowed);

            period_elapsed = now - m.period_start >= m.period_secs;
            let base = if period_elapsed { 0 } else { m.spent_in_period };
            new_spent = base.checked_add(amount).ok_or(MandateError::Overflow)?;
            require!(new_spent <= m.monthly_cap, MandateError::OverMonthlyCap);

            owner_key = m.owner;
            mint_key = m.mint;
            bump = m.bump;
        }

        // ---- transfer USDC owner -> recipient, signed by the mandate PDA (delegate) ----
        let seeds: &[&[u8]] = &[b"mandate", owner_key.as_ref(), mint_key.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.owner_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_token.to_account_info(),
                    authority: ctx.accounts.mandate.to_account_info(),
                },
                signer,
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        // ---- commit state (short mutable borrow) ----
        let m = &mut ctx.accounts.mandate;
        if period_elapsed {
            m.period_start = now;
        }
        m.spent_in_period = new_spent;
        let mandate_key = m.key();
        emit!(Charged { mandate: mandate_key, recipient: recipient_owner, amount, spent_in_period: new_spent });
        Ok(())
    }

    /// One-time checkout split: pay `amount` from the buyer, with `fee_bp` going
    /// to the platform and the rest to the merchant — in ONE instruction (one CPI
    /// for a smart wallet like LazorKit, whose hook executes a single CPI). The
    /// split is computed on-chain (integer floor; dust accrues to the merchant,
    /// never overcharges the platform), so it cannot be tampered client-side.
    /// Authority is the buyer (`payer`), a normal signer — no mandate/delegate.
    pub fn pay_split(ctx: Context<PaySplit>, amount: u64, fee_bp: u16, order_id: [u8; 32]) -> Result<()> {
        require!(amount > 0, MandateError::BadAmount);
        require!(fee_bp <= 10_000, MandateError::BadFeeBp);
        let fee = ((amount as u128) * (fee_bp as u128) / 10_000u128) as u64;
        let merchant_amount = amount.checked_sub(fee).ok_or(MandateError::Overflow)?;
        let decimals = ctx.accounts.mint.decimals;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.payer_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.merchant_token.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            merchant_amount,
            decimals,
        )?;

        if fee > 0 {
            token_interface::transfer_checked(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.payer_token.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.platform_token.to_account_info(),
                        authority: ctx.accounts.payer.to_account_info(),
                    },
                ),
                fee,
                decimals,
            )?;
        }

        emit!(SplitPaid {
            payer: ctx.accounts.payer.key(),
            merchant: ctx.accounts.merchant_token.owner,
            merchant_amount,
            fee,
            order_id,
        });
        Ok(())
    }

    pub fn set_paused(ctx: Context<OwnerOnly>, paused: bool) -> Result<()> {
        ctx.accounts.mandate.paused = paused;
        Ok(())
    }

    pub fn update_caps(ctx: Context<OwnerOnly>, per_payment_cap: u64, monthly_cap: u64) -> Result<()> {
        require!(per_payment_cap > 0 && monthly_cap >= per_payment_cap, MandateError::BadCaps);
        let m = &mut ctx.accounts.mandate;
        m.per_payment_cap = per_payment_cap;
        m.monthly_cap = monthly_cap;
        Ok(())
    }
}

#[account]
pub struct Mandate {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub mint: Pubkey,
    pub per_payment_cap: u64,
    pub monthly_cap: u64,
    pub period_secs: i64,
    pub period_start: i64,
    pub spent_in_period: u64,
    pub paused: bool,
    pub bump: u8,
    pub allowed: Vec<Pubkey>,
}

impl Mandate {
    // discriminator + fixed fields + vec (4 + MAX_ALLOWED*32)
    pub const SIZE: usize = 8 + 32 * 3 + 8 * 4 + 1 + 1 + (4 + MAX_ALLOWED * 32);
}

#[derive(Accounts)]
pub struct InitMandate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = owner,
        space = Mandate::SIZE,
        seeds = [b"mandate", owner.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub mandate: Account<'info, Mandate>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Charge<'info> {
    pub agent: Signer<'info>,
    #[account(
        mut,
        seeds = [b"mandate", mandate.owner.as_ref(), mandate.mint.as_ref()],
        bump = mandate.bump,
    )]
    pub mandate: Account<'info, Mandate>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint)]
    pub owner_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint)]
    pub recipient_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct PaySplit<'info> {
    pub payer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = payer)]
    pub payer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint)]
    pub merchant_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint)]
    pub platform_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"mandate", owner.key().as_ref(), mandate.mint.as_ref()],
        bump = mandate.bump,
        has_one = owner @ MandateError::NotOwner,
    )]
    pub mandate: Account<'info, Mandate>,
}

#[event]
pub struct Charged {
    pub mandate: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub spent_in_period: u64,
}

#[event]
pub struct SplitPaid {
    pub payer: Pubkey,
    pub merchant: Pubkey,
    pub merchant_amount: u64,
    pub fee: u64,
    /// 32-byte order id — binds the on-chain payment to the off-chain order
    /// (the Solana analogue of the Stellar Memo.hash). Backends reconcile on this.
    pub order_id: [u8; 32],
}

#[error_code]
pub enum MandateError {
    #[msg("too many allowlisted recipients")] TooManyRecipients,
    #[msg("bad caps")] BadCaps,
    #[msg("bad period")] BadPeriod,
    #[msg("mandate is paused")] Paused,
    #[msg("signer is not the mandate agent")] NotAgent,
    #[msg("signer is not the mandate owner")] NotOwner,
    #[msg("amount over per-payment cap")] OverPerPaymentCap,
    #[msg("recipient not on allowlist")] RecipientNotAllowed,
    #[msg("amount over monthly cap")] OverMonthlyCap,
    #[msg("overflow")] Overflow,
    #[msg("amount must be > 0")] BadAmount,
    #[msg("fee_bp must be <= 10000")] BadFeeBp,
}
