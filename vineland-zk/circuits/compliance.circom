pragma circom 2.0.0;

// Vineland Confidential Compliance — circuit, iteration 1.
// First real piece: prove the payment amount is within a reporting threshold
// WITHOUT revealing the amount. `amount` is private; `threshold` is public.
// Later iterations add: Merkle membership (anonymous auth), nullifier
// (anti-reuse), and exponential-ElGamal encryption of `amount` under the
// regulator key (selective disclosure).

include "../node_modules/circomlib/circuits/comparators.circom";

template Compliance(nBits) {
    signal input amount;     // private: the real payment amount
    signal input threshold;  // public: the reporting cap (e.g. BCB rule)
    signal output ok;        // public: 1 iff amount <= threshold

    // LessEqThan enforces both inputs fit in nBits and compares.
    component le = LessEqThan(nBits);
    le.in[0] <== amount;
    le.in[1] <== threshold;

    // Hard constraint: the proof is unsatisfiable unless amount <= threshold.
    le.out === 1;
    ok <== le.out;
}

// threshold is the only public input; amount stays hidden.
component main {public [threshold]} = Compliance(64);
