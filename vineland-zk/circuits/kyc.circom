pragma circom 2.0.0;

// Vineland Confidential KYC — proof-of-KYC (Vector 2).
// Extends compliance_v2 (Merkle membership + nullifier) with the two predicates
// a money product actually needs at onboarding, none of the PII revealed:
//
// Statement proved (nothing else revealed):
//   - leaf = Poseidon(nullifier, secret, kycSecret, birthYear, sanctionId)
//       binds the credential to an issuer-attested identity            [credential]
//   - leaf is a member of the Merkle tree with public `root`           [registered, anonymous]
//   - nullifierHash = Poseidon(nullifier)                              [one-time, anti-reuse]
//   - currentYear - birthYear >= 18                                    [of age; birthYear hidden]
//   - sanctionId != each entry of the public sanctions set             [non-sanctioned]
//
// The issuer (a licensed partner: 4P / Etherfuse) signs the leaf into the tree
// after doing the real KYC. Vineland never sees the CPF/PII — only the commitment.
// Full anonymity does not survive BCB Res 519/520/521; selective-disclosure-to-
// regulator does (see mandate_sd's ElGamal total) — this proves eligibility, the
// regulator path stays available through the issuer's records.

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

template KYC(depth, nSanctions) {
    // private witness
    signal input secret;
    signal input nullifier;
    signal input kycSecret;
    signal input birthYear;     // e.g. 1995 — never revealed
    signal input sanctionId;    // issuer-assigned subject id, checked vs the list
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // public inputs
    signal input root;            // registered-credential set
    signal input nullifierHash;   // anti-reuse
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

    // 3) nullifier hash (anti-reuse)
    component nfH = Poseidon(1);
    nfH.inputs[0] <== nullifier;
    nullifierHash === nfH.out;

    // 4) age >= minAge  (currentYear - birthYear >= minAge), birthYear hidden
    signal age;
    age <== currentYear - birthYear;
    component ageOk = GreaterEqThan(8);   // ages 0..255
    ageOk.in[0] <== age;
    ageOk.in[1] <== minAge;
    ageOk.out === 1;

    // 5) sanctions exclusion: sanctionId != every entry of the public list.
    //    IsEqual per entry; require the sum of equalities to be zero.
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
component main {public [root, nullifierHash, currentYear, minAge, sanctionsList]} = KYC(10, 8);
