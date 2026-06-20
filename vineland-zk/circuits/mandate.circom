pragma circom 2.0.0;

// Vineland — "provable bounded autonomy" (jeito 1).
// Proves a BATCH of N agent payments all obeyed the mandate, revealing none of them:
//   - each amount <= perPaymentCap
//   - each recipient is in the public allowlist
//   - sum(amounts) <= monthlyCap
// The RULE (caps, allowlist) is public; the PAYMENTS (amounts, recipients) are private.
// One succinct proof that "the AI never spent outside your rules" — verified on-chain.
// No Poseidon on purpose: keeps witness generation trivial and curve-agnostic.

include "../node_modules/circomlib/circuits/comparators.circom";

// x is one of allowed[0..M): prod_j (x - allowed[j]) == 0
template InAllowlist(M) {
    signal input x;
    signal input allowed[M];
    signal prod[M + 1];
    prod[0] <== 1;
    for (var j = 0; j < M; j++) {
        prod[j + 1] <== prod[j] * (x - allowed[j]);
    }
    prod[M] === 0;
}

template Mandate(N, M, nBits) {
    // private: the batch of payments
    signal input amounts[N];
    signal input recipients[N];

    // public: the mandate
    signal input perPaymentCap;
    signal input monthlyCap;
    signal input allowed[M];

    // public output
    signal output ok;

    // 1) each payment within the per-payment cap
    component le[N];
    for (var i = 0; i < N; i++) {
        le[i] = LessEqThan(nBits);
        le[i].in[0] <== amounts[i];
        le[i].in[1] <== perPaymentCap;
        le[i].out === 1;
    }

    // 2) each recipient is on the allowlist
    component al[N];
    for (var i = 0; i < N; i++) {
        al[i] = InAllowlist(M);
        al[i].x <== recipients[i];
        for (var j = 0; j < M; j++) {
            al[i].allowed[j] <== allowed[j];
        }
    }

    // 3) aggregate within the monthly cap
    signal acc[N + 1];
    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        acc[i + 1] <== acc[i] + amounts[i];
    }
    component leSum = LessEqThan(nBits + 8);
    leSum.in[0] <== acc[N];
    leSum.in[1] <== monthlyCap;
    leSum.out === 1;

    ok <== 1;
}

// 8 payments, allowlist of 4, 64-bit amounts.
component main {public [perPaymentCap, monthlyCap, allowed]} = Mandate(8, 4, 64);
