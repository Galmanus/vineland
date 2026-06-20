pragma circom 2.0.0;

// Vineland Confidential Compliance — circuit, iteration 2.
// Adds anonymous authentication (Merkle membership) + anti-reuse (nullifier)
// on top of the threshold check. Iteration 3 will add exponential-ElGamal
// encryption of `amount` under the regulator key (selective disclosure).
//
// Statement proved (nothing else revealed):
//   - leaf = Poseidon(nullifier, secret, kycSecret)   [binds credential + KYC]
//   - leaf is a member of the Merkle tree with public `root`  [registered, anonymous]
//   - nullifierHash = Poseidon(nullifier)              [one-time, anti-reuse]
//   - amount <= threshold                              [compliance; amount hidden]

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

// One Merkle level: hash (cur, sibling) in the order given by the index bit.
template MerkleLevel() {
    signal input cur;
    signal input sibling;
    signal input index;   // 0 => cur is left; 1 => cur is right
    signal output out;

    // enforce index is a bit
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

template Compliance(depth, nBits) {
    // private
    signal input amount;
    signal input secret;
    signal input nullifier;
    signal input kycSecret;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // public
    signal input root;
    signal input nullifierHash;
    signal input threshold;

    // public output
    signal output ok;

    // 1) commitment leaf binds credential + KYC
    component leafH = Poseidon(3);
    leafH.inputs[0] <== nullifier;
    leafH.inputs[1] <== secret;
    leafH.inputs[2] <== kycSecret;

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

    // 3) nullifier hash (anti-reuse), bound to public input
    component nfH = Poseidon(1);
    nfH.inputs[0] <== nullifier;
    nullifierHash === nfH.out;

    // 4) compliance: amount <= threshold, amount stays private
    component le = LessEqThan(nBits);
    le.in[0] <== amount;
    le.in[1] <== threshold;
    le.out === 1;
    ok <== le.out;
}

// depth 10 (1024 leaves) is plenty for the demo; 64-bit amounts.
component main {public [root, nullifierHash, threshold]} = Compliance(10, 64);
