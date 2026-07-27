//! riverrun nullifier registry: the on-chain half of "one action per context".
//!
//! **What this is.** riverrun ID (`vineland-stellar/riverrun-id-wasm`) derives a
//! per-context nullifier, `fit(θ)`, deterministically from a holder's secret and a
//! public angle `θ` (a round, an epoch, a vote). The construction guarantees a
//! holder can compute only one valid `fit` per angle; it does NOT by itself stop
//! that `fit` from being submitted twice. This contract is the missing half: a
//! registry that records a `(angle, fit)` pair the first time it is submitted and
//! rejects every repeat, on-chain, publicly checkable.
//!
//! **What this is not.** This contract does not verify that `fit` was derived
//! correctly from a real secret, that the holder was ever a member of any
//! anonymity set, or any riverrun relation at all (see
//! `riverrun-id-wasm::relation` for the plaintext specification of those
//! relations, and its README for why the zero-knowledge proof of them is
//! separate, unstarted work). This registry only enforces: a given `(angle,
//! fit)` pair is accepted at most once. Membership and relation verification are
//! a caller's job today, off-chain or in a future proof-gated call; layering
//! that verification in front of `submit_fit` is the natural next step once a
//! Soroban-compatible proof backend exists.
//!
//! **Why `submit_fit` takes no `Address` and calls no `require_auth`.**
//! Requiring the submitter to authenticate as a fixed on-chain identity would
//! attach every anonymized action to a linkable transaction signer, which
//! defeats the exact property riverrun exists to provide. The registry's only
//! guard is uniqueness of `(angle, fit)`; anyone can submit any value, and the
//! contract does not learn or care who. Sybil resistance and validity come from
//! `fit` being unforgeable without the secret (a property riverrun-id-wasm
//! proves in isolation, off-chain) plus, once it exists, a proof gate in front
//! of this call. Without that gate, an adversary can submit a `fit` for an angle
//! they were never a member of; this contract alone does not stop that, and does
//! not claim to.

#![no_std]
use soroban_sdk::{contract, contractevent, contracterror, contractimpl, contracttype, panic_with_error, BytesN, Env};

// Same TTL convention as vineland-receipt / vineland-subscription's audit-002 F1.
const TTL_THRESHOLD_LEDGERS: u32 = 17_280; // ~1 day at 5s/ledger
const TTL_TARGET_LEDGERS: u32 = 535_000; // ~31 days at 5s/ledger (clamped)

#[contracttype]
pub enum DataKey {
    /// Whether `(angle, fit)` has already been recorded.
    Spent(u64, BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Error {
    /// `submit_fit` called with an `(angle, fit)` pair already recorded: the
    /// double-spend / one-action-per-context guard.
    AlreadySpent = 1,
}

/// Emitted once, the first time a given `(angle, fit)` pair is recorded.
#[contractevent]
pub struct FitSpent {
    #[topic]
    pub angle: u64,
    pub fit: BytesN<32>,
}

#[contract]
pub struct NullifierRegistry;

#[contractimpl]
impl NullifierRegistry {
    /// Record `fit` as spent at `angle`. Rejects with `AlreadySpent` if this
    /// exact `(angle, fit)` pair was already recorded; otherwise stores it,
    /// extends its TTL, emits a `fit_spent` event carrying `(angle, fit)`, and
    /// returns nothing. No authorization is required (see module docs for why).
    pub fn submit_fit(env: Env, angle: u64, fit: BytesN<32>) {
        let key = DataKey::Spent(angle, fit.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::AlreadySpent);
        }
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_TARGET_LEDGERS);

        FitSpent { angle, fit }.publish(&env);
    }

    /// Whether `(angle, fit)` has already been recorded. Never panics; absence
    /// is a normal `false`, not an error, since a nullifier registry always
    /// starts empty.
    pub fn is_spent(env: Env, angle: u64, fit: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Spent(angle, fit))
    }
}

#[cfg(test)]
mod test;
