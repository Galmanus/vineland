pragma circom 2.0.0;

// riverrun — KYC-gated join (adapted from slippay-zk's kyc.circom).
//
// A member proves, revealing NO PII, that they are a registered, of-age,
// non-sanctioned human, AND binds the join to a specific riverrun pool through an
// external nullifier. Consequences:
//   - one credential can join a given pool at most once (joinNullifier is unique
//     per (credential, pool) and recorded on-chain to block re-use);
//   - the same credential joining two different pools is UNLINKABLE, because the
//     external nullifier mixes in the pool id.
//
// Statement proved (nothing else revealed):
//   leaf = Poseidon(nullifier, secret, kycSecret, birthYear, sanctionId)   [issuer-attested credential]
//   leaf is in the Merkle tree with public `root`                          [registered, anonymous]
//   joinNullifier = Poseidon(nullifier, poolId)                            [one join per pool; cross-pool unlinkable]
//   currentYear - birthYear >= minAge                                      [of age; birthYear hidden]
//   sanctionId != each entry of the public sanctions set                   [non-sanctioned; id hidden]
//
// COMPLIANCE / MATURITY NOTE. This is Groth16 over BN254 — pairing-based, NOT
// post-quantum, and it needs a trusted setup. It is the classical COMPLIANCE
// (path-3) component: it gates who may enter the crowd, and it is the layer where
// a licensed issuer + regulator live. riverrun's ANONYMITY core (which member
// acted) is hash-based STARK and stays post-quantum; only this admission gate is
// classical. The post-quantum port of the compliance layer is roadmap.
// The issuer (a licensed KYC partner) signs the leaf into the tree after real
// KYC; riverrun never sees the PII, only the commitment.

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

// One Merkle level: hash (cur, sibling) in the order given by the index bit.
template MerkleLevel() {
    signal input cur;
    signal input sibling;
    signal input index;   // 0 => cur is left; 1 => cur is right
    signal output out;

    index * (1 - index) === 0;

    component left  = Mux1();
    left.c[0] <== cur;
    left.c[1] <== sibling;
    left.s    <== index;

    component right = Mux1();
    right.c[0] <== sibling;
    right.c[1] <== cur;
    right.s    <== index;

    component h = Poseidon(2);
    h.inputs[0] <== left.out;
    h.inputs[1] <== right.out;
    out <== h.out;
}

template RiverrunJoin(depth, nSanctions) {
    // private witness
    signal input secret;
    signal input nullifier;
    signal input kycSecret;
    signal input birthYear;     // e.g. 1995 — never revealed
    signal input sanctionId;    // issuer-assigned subject id, checked vs the list
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // public inputs
    signal input root;            // registered-credential set (issuer's Merkle root)
    signal input joinNullifier;   // Poseidon(nullifier, poolId): per-pool anti-reuse
    signal input poolId;          // the riverrun pool being joined (external nullifier)
    signal input currentYear;     // e.g. 2026 — the verifier sets this
    signal input minAge;          // e.g. 18
    signal input sanctionsList[nSanctions]; // public sanctioned-id set

    // public output
    signal output ok;

    // 1) commitment leaf binds credential + KYC attributes (issuer-attested)
    component leafH = Poseidon(5);
    leafH.inputs[0] <== nullifier;
    leafH.inputs[1] <== secret;
    leafH.inputs[2] <== kycSecret;
    leafH.inputs[3] <== birthYear;
    leafH.inputs[4] <== sanctionId;

    // 2) Merkle membership to public root (anonymous auth)
    component levels[depth];
    signal cur[depth + 1];
    cur[0] <== leafH.out;
    for (var i = 0; i < depth; i++) {
        levels[i] = MerkleLevel();
        levels[i].cur     <== cur[i];
        levels[i].sibling <== pathElements[i];
        levels[i].index   <== pathIndices[i];
        cur[i + 1] <== levels[i].out;
    }
    root === cur[depth];

    // 3) pool-bound join nullifier: Poseidon(nullifier, poolId). Recorded on-chain
    //    to stop a second join with the same credential in the same pool; mixing in
    //    poolId keeps joins to different pools unlinkable.
    component nfH = Poseidon(2);
    nfH.inputs[0] <== nullifier;
    nfH.inputs[1] <== poolId;
    joinNullifier === nfH.out;

    // 4) age >= minAge  (currentYear - birthYear >= minAge), birthYear hidden
    signal age;
    age <== currentYear - birthYear;
    component ageOk = GreaterEqThan(8);   // ages 0..255
    ageOk.in[0] <== age;
    ageOk.in[1] <== minAge;
    ageOk.out === 1;

    // 5) sanctions exclusion: sanctionId != every entry of the public list.
    component eq[nSanctions];
    signal acc[nSanctions + 1];
    acc[0] <== 0;
    for (var j = 0; j < nSanctions; j++) {
        eq[j] = IsEqual();
        eq[j].in[0] <== sanctionId;
        eq[j].in[1] <== sanctionsList[j];
        acc[j + 1] <== acc[j] + eq[j].out;
    }
    acc[nSanctions] === 0;   // not equal to any sanctioned id

    ok <== ageOk.out;
}

// depth 10 (1024 credentials), sanctions list of 8 for the demo.
component main {public [root, joinNullifier, poolId, currentYear, minAge, sanctionsList]} = RiverrunJoin(10, 8);
