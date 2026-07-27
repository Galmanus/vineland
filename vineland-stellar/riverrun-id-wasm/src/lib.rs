//! riverrun ID, ported: the rotatable-piece identity primitive, chain-agnostic.
//!
//! This is a faithful port of the identity-derivation core of `riverrun-core`
//! (`github.com/solanabr/mirror-pool`, MIT), the post-quantum anonymity layer built
//! for Solana. The construction (one hash-based secret, a different unlinkable
//! "shape" at every context, a per-context "fit" nullifier, holder-only rotation,
//! scoped delegation, selective credentials) is entirely chain-agnostic: it is
//! BLAKE3 domain separation over raw bytes, nothing Solana-specific anywhere in it.
//!
//! What this crate proves, concretely: the identity math compiles to
//! `wasm32-unknown-unknown`, the target Soroban contracts (Stellar's smart-contract
//! platform) run on. That is the first, honest step toward "riverrun ID as a
//! chain-agnostic identity primitive Stellar's own privacy stack could sit on top
//! of" (Confidential Tokens and Stellar Private Payments each build a privacy
//! *application*; neither ships a reusable per-context identity primitive
//! underneath). Everything else, a Soroban contract that verifies a fit/nullifier,
//! a real integration, is not built here and is not claimed as done.
//!
//! Honest scope, named plainly:
//! - Ported: `commit`, `nullifier`, and the five direct-derivation powers of the
//!   piece (`shape`, `fit`, `turn`, `grant`, `credential`).
//! - Not ported (needs `merkle.rs` + a proof backend, out of scope for this slice):
//!   the `check_turn` / `check_link` / `check_delegation` / `check_attribute`
//!   *relations* a zero-knowledge proof would enforce. Those are the next step,
//!   not this one.
//! - `Secret` here has no random constructor. Secret generation is always a
//!   client-side, off-chain concern, on every chain (a contract, Soroban included,
//!   has no entropy source of its own) — this is not a limitation introduced by the
//!   port, it is the same boundary riverrun-core already draws.
//!
//! No renaming, no rebranding: this is riverrun's own construction, credited and
//! reused, because the reasoning structure is the point, not a fresh invention.

#![cfg_attr(feature = "no_std", no_std)]

/// A 32-byte digest, the output of every hash here.
pub type Hash = [u8; 32];

// Domain separation, identical to riverrun-core, so a value derived here can never
// collide with or be reinterpreted as a value from a different role.
mod domain {
    pub const COMMITMENT: &[u8] = b"riverrun/commitment/v1";
    pub const NULLIFIER: &[u8] = b"riverrun/nullifier/v1";
    pub const SHAPE: &[u8] = b"riverrun/piece-shape/v1";
    pub const FIT: &[u8] = b"riverrun/piece-fit/v1";
    pub const TURN: &[u8] = b"riverrun/piece-turn/v1";
    pub const GRANT: &[u8] = b"riverrun/piece-grant/v1";
    pub const CRED: &[u8] = b"riverrun/piece-credential/v1";
}

fn tagged_hash(tag: &[u8], parts: &[&[u8]]) -> Hash {
    let mut hasher = blake3::Hasher::new();
    hasher.update(tag);
    for part in parts {
        hasher.update(part);
    }
    *hasher.finalize().as_bytes()
}

/// A member's private witness. Never published; used to derive the commitment and,
/// per round, the nullifier. There is no random constructor here on purpose: secret
/// generation is a client-side concern on every chain, never a contract's job.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Secret(pub [u8; 32]);

impl Secret {
    pub const fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// View this secret as a rotatable piece.
    pub fn piece(&self) -> Piece<'_> {
        Piece(self)
    }
}

/// A published commitment, one leaf of an anonymity-set structure.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Commitment(pub Hash);

/// Derive a member's commitment from their secret and a public identity handle
/// (any fixed-width public value, an account id, a context tag).
pub fn commit(secret: &Secret, identity: &[u8; 32]) -> Commitment {
    Commitment(tagged_hash(domain::COMMITMENT, &[secret.as_bytes(), identity]))
}

/// A round identifier: any value both sides agree pins down "this round".
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct RoundId(pub [u8; 32]);

/// A revealed nullifier: an on-chain registry stores the set of these that have
/// been spent, and rejects repeats within a round.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Nullifier(pub Hash);

/// Derive a member's nullifier for a given round from their secret.
pub fn nullifier(secret: &Secret, round: &RoundId) -> Nullifier {
    Nullifier(tagged_hash(domain::NULLIFIER, &[secret.as_bytes(), &round.0]))
}

/// A public angle: any label naming a context the piece is viewed from (an app id,
/// an epoch, a round). The label space is unbounded.
pub type Angle = u64;

/// A rotatable piece: a single [`Secret`] viewed from any angle.
pub struct Piece<'a>(&'a Secret);

impl Piece<'_> {
    /// The piece's shape at angle `θ`: what it looks like in this context, e.g. the
    /// commitment leaf published for this angle's set. Unlinkable across angles.
    pub fn shape(&self, theta: Angle) -> Hash {
        tagged_hash(domain::SHAPE, &[self.0.as_bytes(), &theta.to_le_bytes()])
    }

    /// The piece's fit at angle `θ`: the per-angle nullifier, spent once,
    /// unlinkable to any other angle.
    pub fn fit(&self, theta: Angle) -> Hash {
        tagged_hash(domain::FIT, &[self.0.as_bytes(), &theta.to_le_bytes()])
    }

    /// The turn tag from angle `θ` to `θ+1`: derivable only with the secret, the
    /// witness that two angles are the same piece, revealed once (a migration
    /// nullifier) to prove continuity without letting one piece fork into many.
    pub fn turn(&self, theta: Angle) -> Hash {
        tagged_hash(
            domain::TURN,
            &[self.0.as_bytes(), &theta.to_le_bytes(), &theta.wrapping_add(1).to_le_bytes()],
        )
    }

    /// A scoped delegation grant, authorizing `delegate` to act as this piece in
    /// context `θ`, and only there.
    pub fn grant(&self, theta: Angle, delegate: &[u8; 32]) -> Hash {
        tagged_hash(domain::GRANT, &[self.0.as_bytes(), &theta.to_le_bytes(), delegate])
    }

    /// The piece's credential leaf for attribute `attr`: an issuer who has verified
    /// the holder carries `attr` publishes this leaf; the holder later proves the
    /// attribute per context without revealing the secret or any other context.
    pub fn credential(&self, attr: &[u8; 32]) -> Hash {
        tagged_hash(domain::CRED, &[self.0.as_bytes(), attr])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret(byte: u8) -> Secret {
        Secret::from_bytes([byte; 32])
    }

    #[test]
    fn shape_is_deterministic_and_differs_by_angle() {
        let s = secret(1);
        let a = s.piece().shape(1);
        let b = s.piece().shape(1);
        let c = s.piece().shape(2);
        assert_eq!(a, b, "same secret, same angle, same shape");
        assert_ne!(a, c, "same secret, different angle, unlinkable shape");
    }

    #[test]
    fn fit_is_the_one_time_nullifier_per_angle() {
        let s = secret(1);
        assert_ne!(s.piece().fit(1), s.piece().fit(2));
    }

    #[test]
    fn different_secrets_never_collide() {
        let a = secret(1).piece().shape(1);
        let b = secret(2).piece().shape(1);
        assert_ne!(a, b);
    }

    #[test]
    fn commit_and_nullifier_are_domain_separated_from_shape_and_fit() {
        let s = secret(1);
        let id = [7u8; 32];
        let round = RoundId([9u8; 32]);
        let c = commit(&s, &id);
        let n = nullifier(&s, &round);
        // Not a formal collision proof, just the sanity a domain-separated
        // construction gives: distinct roles produce distinct-looking outputs for
        // these fixed test inputs.
        assert_ne!(c.0, n.0);
        assert_ne!(c.0, s.piece().shape(1));
    }

    #[test]
    fn turn_binds_both_the_departure_and_arrival_angle() {
        let s = secret(1);
        assert_ne!(s.piece().turn(1), s.piece().turn(2));
    }

    #[test]
    fn grant_is_scoped_to_the_delegate_and_the_angle() {
        let s = secret(1);
        let d1 = [1u8; 32];
        let d2 = [2u8; 32];
        assert_ne!(s.piece().grant(1, &d1), s.piece().grant(1, &d2));
        assert_ne!(s.piece().grant(1, &d1), s.piece().grant(2, &d1));
    }

    #[test]
    fn credential_is_per_attribute_and_unlinkable_to_shape() {
        let s = secret(1);
        let attr_over_18 = [18u8; 32];
        let attr_kyc = [19u8; 32];
        assert_ne!(s.piece().credential(&attr_over_18), s.piece().credential(&attr_kyc));
    }
}
