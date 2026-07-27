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
//! - Ported: `commit`, `nullifier`, the five direct-derivation powers of the piece
//!   (`shape`, `fit`, `turn`, `grant`, `credential`), the Merkle anonymity-set tree
//!   (`merkle`), and the four **native relation checkers** (`check_turn`,
//!   `check_link`, `check_delegation`, `check_attribute`): the plaintext
//!   true/false evaluators that state exactly what a zero-knowledge proof of a
//!   rotation, a chosen link, a delegation, or a credential show would have to
//!   enforce.
//! - Not ported, and not claimed as done: the zero-knowledge *proof* of any of
//!   those four relations. `check_turn` etc. take the witness (the secret, the
//!   inclusion path) as a plaintext input and return a bool; they are the
//!   specification a STARK circuit must match, not the circuit itself. That
//!   circuit is `riverrun-stark` / `riverrun-m31` in the mirror-pool repo, built
//!   for Winterfell/Plonky3 over Solana's constraints, and porting *that* to a
//!   Soroban-compatible proof backend is real, separate, unstarted work.
//! - `Secret` here has no random constructor. Secret generation is always a
//!   client-side, off-chain concern, on every chain (a contract, Soroban included,
//!   has no entropy source of its own), this is not a limitation introduced by the
//!   port; it is the same boundary riverrun-core already draws.
//!
//! No renaming, no rebranding: this is riverrun's own construction, credited and
//! reused, because the reasoning structure is the point, not a fresh invention.

#![cfg_attr(feature = "no_std", no_std)]

#[cfg(feature = "no_std")]
extern crate alloc;

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
    pub const MERKLE_LEAF: &[u8] = b"riverrun/merkle-leaf/v1";
    pub const MERKLE_NODE: &[u8] = b"riverrun/merkle-node/v1";
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

/// The anonymity set as a binary Merkle tree over piece shapes/credentials.
///
/// Ported faithfully from `riverrun-core::merkle`: leaves and internal nodes are
/// domain-separated (`MERKLE_LEAF` vs `MERKLE_NODE`), so an internal node can never
/// be replayed as a leaf, and the tree is padded to a power-of-two width with a
/// fixed public empty-leaf value so proof shape does not leak the exact member
/// count beyond the padded width.
pub mod merkle {
    use super::{domain, tagged_hash, Commitment, Hash};

    #[cfg(feature = "no_std")]
    use alloc::vec::Vec;

    /// The value used to pad the leaf layer up to a power of two.
    pub const EMPTY_LEAF: Hash = [0u8; 32];

    /// A witness that a particular leaf sits under a particular root.
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct InclusionProof {
        pub index: usize,
        pub siblings: Vec<Hash>,
    }

    /// A built anonymity set: the leaf layer plus the cached root.
    #[derive(Clone, Debug)]
    pub struct MerkleTree {
        leaves: Vec<Hash>,
        len: usize,
        root: Hash,
    }

    fn hash_leaf(commitment: &Commitment) -> Hash {
        tagged_hash(domain::MERKLE_LEAF, &[&commitment.0])
    }

    fn hash_node(left: &Hash, right: &Hash) -> Hash {
        tagged_hash(domain::MERKLE_NODE, &[left, right])
    }

    impl MerkleTree {
        /// Build the tree from an ordered list of member commitments/shapes. The
        /// order defines each member's index; it must match between the prover
        /// (who builds an inclusion proof) and whoever published the root.
        pub fn build(members: &[Commitment]) -> Option<Self> {
            if members.is_empty() {
                return None;
            }
            let len = members.len();
            let mut leaves: Vec<Hash> = members.iter().map(hash_leaf).collect();
            let width = len.next_power_of_two();
            leaves.resize(width, EMPTY_LEAF);
            let root = Self::compute_root(&leaves);
            Some(Self { leaves, len, root })
        }

        fn compute_root(leaves: &[Hash]) -> Hash {
            let mut level = leaves.to_vec();
            while level.len() > 1 {
                level = level.chunks_exact(2).map(|pair| hash_node(&pair[0], &pair[1])).collect();
            }
            level[0]
        }

        pub fn root(&self) -> Hash {
            self.root
        }

        pub fn len(&self) -> usize {
            self.len
        }

        pub fn is_empty(&self) -> bool {
            self.len == 0
        }

        /// Produce an inclusion proof for the member at `index`.
        pub fn prove(&self, index: usize) -> Option<InclusionProof> {
            if index >= self.len {
                return None;
            }
            let mut siblings = Vec::new();
            let mut level = self.leaves.clone();
            let mut idx = index;
            while level.len() > 1 {
                let sibling = if idx % 2 == 0 { level[idx + 1] } else { level[idx - 1] };
                siblings.push(sibling);
                level = level.chunks_exact(2).map(|pair| hash_node(&pair[0], &pair[1])).collect();
                idx /= 2;
            }
            Some(InclusionProof { index, siblings })
        }
    }

    /// Verify an inclusion proof: recompute the root from `commitment` and the
    /// proof's sibling path, and check it matches `root`. This is the plaintext
    /// membership check; a proof circuit runs the same recomputation over a
    /// private witness so the leaf position is never revealed.
    pub fn verify(root: &Hash, commitment: &Commitment, proof: &InclusionProof) -> bool {
        let mut acc = hash_leaf(commitment);
        let mut idx = proof.index;
        for sibling in &proof.siblings {
            acc = if idx % 2 == 0 { hash_node(&acc, sibling) } else { hash_node(sibling, &acc) };
            idx /= 2;
        }
        &acc == root
    }
}

/// The four native relation checkers: plaintext true/false evaluators that state
/// exactly what a zero-knowledge proof of a rotation, a chosen link, a scoped
/// delegation, or an attribute show would have to enforce. Ported faithfully from
/// `riverrun-core::rotatable`'s relation section: same statement/witness shapes,
/// same constraints, same test cases. These are the specification for a proof
/// circuit, not the circuit itself. See the module-level doc for the boundary.
pub mod relation {
    use super::merkle::{verify as merkle_verify, InclusionProof};
    use super::{Angle, Commitment, Hash, Secret};

    /// Public statement of a rotation: a piece that was a member under `prev_root`
    /// at `angle` rotated, revealing the migration tag `turn_tag`.
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct TurnStatement {
        pub prev_root: Hash,
        pub angle: Angle,
        pub turn_tag: Hash,
    }

    /// Private witness for a rotation proof: the piece and its inclusion path.
    #[derive(Clone)]
    pub struct TurnWitness<'a> {
        pub secret: &'a Secret,
        pub inclusion: InclusionProof,
    }

    /// Evaluate the turn relation in the clear. Two constraints: the revealed tag
    /// came from this piece (`turn_tag == secret.piece().turn(angle)`), and this
    /// piece's shape at `angle` sits under `prev_root`.
    pub fn check_turn(statement: &TurnStatement, witness: &TurnWitness) -> bool {
        let piece = witness.secret.piece();
        if piece.turn(statement.angle) != statement.turn_tag {
            return false;
        }
        let shape = Commitment(piece.shape(statement.angle));
        merkle_verify(&statement.prev_root, &shape, &witness.inclusion)
    }

    /// Public statement of a chosen link: "these two shapes are the same piece."
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct LinkStatement {
        pub shape_a: Hash,
        pub angle_a: Angle,
        pub shape_b: Hash,
        pub angle_b: Angle,
    }

    /// Private witness: the piece itself.
    #[derive(Clone)]
    pub struct LinkWitness<'a> {
        pub secret: &'a Secret,
    }

    /// Evaluate the selective-link relation: one secret must produce both shapes.
    pub fn check_link(statement: &LinkStatement, witness: &LinkWitness) -> bool {
        let piece = witness.secret.piece();
        piece.shape(statement.angle_a) == statement.shape_a
            && piece.shape(statement.angle_b) == statement.shape_b
    }

    /// Public statement of a scoped delegation: a member at `angle`, under
    /// `set_root`, authorizes `delegate` there, and the proof is `grant_tag`.
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct DelegationStatement {
        pub set_root: Hash,
        pub angle: Angle,
        pub delegate: [u8; 32],
        pub grant_tag: Hash,
    }

    /// Private witness: the granting piece and its inclusion path.
    #[derive(Clone)]
    pub struct DelegationWitness<'a> {
        pub secret: &'a Secret,
        pub inclusion: InclusionProof,
    }

    /// Evaluate the scoped-delegation relation: the grant is bound to this
    /// delegate and this angle, and the granting piece is really a member.
    pub fn check_delegation(statement: &DelegationStatement, witness: &DelegationWitness) -> bool {
        let piece = witness.secret.piece();
        if piece.grant(statement.angle, &statement.delegate) != statement.grant_tag {
            return false;
        }
        let shape = Commitment(piece.shape(statement.angle));
        merkle_verify(&statement.set_root, &shape, &witness.inclusion)
    }

    /// Public statement of an attribute show: identity `shape` in `angle` carries
    /// `attr`, issued into the set `attr_root`.
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct AttributeStatement {
        pub attr_root: Hash,
        pub attr: [u8; 32],
        pub angle: Angle,
        pub shape: Hash,
    }

    /// Private witness: the piece and its credential-leaf inclusion path.
    #[derive(Clone)]
    pub struct AttributeWitness<'a> {
        pub secret: &'a Secret,
        pub credential_inclusion: InclusionProof,
    }

    /// Evaluate the attribute-show relation: the piece is credentialed for `attr`
    /// under `attr_root`, and the attribute binds to exactly the shown identity.
    pub fn check_attribute(statement: &AttributeStatement, witness: &AttributeWitness) -> bool {
        let piece = witness.secret.piece();
        let cred = Commitment(piece.credential(&statement.attr));
        if !merkle_verify(&statement.attr_root, &cred, &witness.credential_inclusion) {
            return false;
        }
        piece.shape(statement.angle) == statement.shape
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

    // --- merkle: the anonymity set ---

    use merkle::MerkleTree;

    fn shape_set(members: &[Secret], theta: Angle) -> MerkleTree {
        let leaves: Vec<Commitment> = members.iter().map(|s| Commitment(s.piece().shape(theta))).collect();
        MerkleTree::build(&leaves).unwrap()
    }

    #[test]
    fn every_member_has_a_valid_inclusion_proof() {
        let members = [secret(1), secret(2), secret(3), secret(4), secret(5)]; // non-power-of-two, exercises padding
        let theta = 1u64;
        let tree = shape_set(&members, theta);
        let root = tree.root();
        for (i, m) in members.iter().enumerate() {
            let leaf = Commitment(m.piece().shape(theta));
            let proof = tree.prove(i).unwrap();
            assert!(merkle::verify(&root, &leaf, &proof), "member {i} should verify");
        }
    }

    #[test]
    fn a_non_member_fails_inclusion() {
        let members = [secret(1), secret(2), secret(3), secret(4)];
        let theta = 1u64;
        let tree = shape_set(&members, theta);
        let proof = tree.prove(0).unwrap();
        let outsider = Commitment(secret(99).piece().shape(theta));
        assert!(!merkle::verify(&tree.root(), &outsider, &proof));
    }

    // --- relation: the turn relation (what a ZK rotation proof enforces) ---

    use relation::*;

    #[test]
    fn a_valid_rotation_proves() {
        let theta = 4u64;
        let me = secret(1);
        let members = [secret(9), secret(1), secret(7), secret(5)];
        let tree = shape_set(&members, theta);
        let stmt = TurnStatement { prev_root: tree.root(), angle: theta, turn_tag: me.piece().turn(theta) };
        let wit = TurnWitness { secret: &me, inclusion: tree.prove(1).unwrap() };
        assert!(check_turn(&stmt, &wit), "a genuine rotation of a member piece must verify");
    }

    #[test]
    fn a_forged_turn_tag_fails() {
        let theta = 4u64;
        let me = secret(1);
        let members = [secret(9), secret(1), secret(7), secret(5)];
        let tree = shape_set(&members, theta);
        let stmt = TurnStatement {
            prev_root: tree.root(),
            angle: theta,
            turn_tag: secret(2).piece().turn(theta), // not my piece
        };
        let wit = TurnWitness { secret: &me, inclusion: tree.prove(1).unwrap() };
        assert!(!check_turn(&stmt, &wit), "a turn tag not from this piece must fail");
    }

    #[test]
    fn a_piece_not_in_the_previous_set_fails() {
        let theta = 4u64;
        let outsider = secret(42);
        let members = [secret(9), secret(1), secret(7), secret(5)];
        let tree = shape_set(&members, theta);
        let stmt =
            TurnStatement { prev_root: tree.root(), angle: theta, turn_tag: outsider.piece().turn(theta) };
        let wit = TurnWitness { secret: &outsider, inclusion: tree.prove(1).unwrap() };
        assert!(!check_turn(&stmt, &wit), "a piece not in the set must not rotate");
    }

    // --- relation: selective linkage ---

    #[test]
    fn the_holder_can_link_two_of_their_identities_on_demand() {
        let me = secret(1);
        let (dao, forum): (Angle, Angle) = (100, 200);
        let stmt = LinkStatement {
            shape_a: me.piece().shape(dao),
            angle_a: dao,
            shape_b: me.piece().shape(forum),
            angle_b: forum,
        };
        assert!(check_link(&stmt, &LinkWitness { secret: &me }));
    }

    #[test]
    fn an_impostor_cannot_forge_a_link() {
        let me = secret(1);
        let (dao, forum): (Angle, Angle) = (100, 200);
        let stmt = LinkStatement {
            shape_a: me.piece().shape(dao),
            angle_a: dao,
            shape_b: me.piece().shape(forum),
            angle_b: forum,
        };
        let impostor = secret(2);
        assert!(!check_link(&stmt, &LinkWitness { secret: &impostor }));
    }

    // --- relation: scoped delegation ---

    #[test]
    fn a_member_can_delegate_one_context_to_an_agent() {
        let theta: Angle = 7;
        let me = secret(1);
        let agent = [0xA6u8; 32];
        let members = [secret(9), secret(1), secret(3), secret(5)];
        let set = shape_set(&members, theta);
        let stmt = DelegationStatement {
            set_root: set.root(),
            angle: theta,
            delegate: agent,
            grant_tag: me.piece().grant(theta, &agent),
        };
        let wit = DelegationWitness { secret: &me, inclusion: set.prove(1).unwrap() };
        assert!(check_delegation(&stmt, &wit), "a member can delegate their own context");
    }

    #[test]
    fn a_grant_is_bound_to_the_named_delegate() {
        let theta: Angle = 7;
        let me = secret(1);
        let members = [secret(9), secret(1), secret(3), secret(5)];
        let set = shape_set(&members, theta);
        let stmt = DelegationStatement {
            set_root: set.root(),
            angle: theta,
            delegate: [0xBBu8; 32], // a DIFFERENT agent than the grant was for
            grant_tag: me.piece().grant(theta, &[0xA6u8; 32]),
        };
        let wit = DelegationWitness { secret: &me, inclusion: set.prove(1).unwrap() };
        assert!(!check_delegation(&stmt, &wit), "a grant for one agent must not work for another");
    }

    #[test]
    fn a_non_member_cannot_delegate() {
        let theta: Angle = 7;
        let outsider = secret(42);
        let agent = [0xA6u8; 32];
        let set = shape_set(&[secret(9), secret(1), secret(3), secret(5)], theta);
        let stmt = DelegationStatement {
            set_root: set.root(),
            angle: theta,
            delegate: agent,
            grant_tag: outsider.piece().grant(theta, &agent),
        };
        let wit = DelegationWitness { secret: &outsider, inclusion: set.prove(1).unwrap() };
        assert!(!check_delegation(&stmt, &wit), "only a member of the context can delegate it");
    }

    // --- relation: attribute credentials ---

    fn attr_set(holders: &[Secret], attr: &[u8; 32]) -> MerkleTree {
        let leaves: Vec<Commitment> = holders.iter().map(|s| Commitment(s.piece().credential(attr))).collect();
        MerkleTree::build(&leaves).unwrap()
    }

    #[test]
    fn a_credentialed_holder_shows_the_attribute_in_a_context() {
        let over18 = [0x18u8; 32];
        let me = secret(1);
        let issued = [secret(9), secret(1), secret(3), secret(5)];
        let root = attr_set(&issued, &over18);
        let theta: Angle = 500;
        let stmt =
            AttributeStatement { attr_root: root.root(), attr: over18, angle: theta, shape: me.piece().shape(theta) };
        let wit = AttributeWitness { secret: &me, credential_inclusion: root.prove(1).unwrap() };
        assert!(check_attribute(&stmt, &wit), "a credentialed holder can show the attribute");
    }

    #[test]
    fn an_uncredentialed_holder_cannot_show_the_attribute() {
        let over18 = [0x18u8; 32];
        let outsider = secret(42);
        let issued = [secret(9), secret(1), secret(3), secret(5)];
        let root = attr_set(&issued, &over18);
        let theta: Angle = 500;
        let stmt = AttributeStatement {
            attr_root: root.root(),
            attr: over18,
            angle: theta,
            shape: outsider.piece().shape(theta),
        };
        let wit = AttributeWitness { secret: &outsider, credential_inclusion: root.prove(1).unwrap() };
        assert!(!check_attribute(&stmt, &wit), "only a credentialed holder can show it");
    }

    #[test]
    fn a_credential_for_one_attribute_does_not_show_another() {
        let over18 = [0x18u8; 32];
        let investor = [0x99u8; 32];
        let me = secret(1);
        let root = attr_set(&[secret(9), secret(1), secret(3), secret(5)], &over18);
        let theta: Angle = 500;
        let stmt =
            AttributeStatement { attr_root: root.root(), attr: investor, angle: theta, shape: me.piece().shape(theta) };
        let wit = AttributeWitness { secret: &me, credential_inclusion: root.prove(1).unwrap() };
        assert!(!check_attribute(&stmt, &wit), "a credential is specific to its attribute");
    }
}
