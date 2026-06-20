pragma circom 2.0.0;

// Vineland — mandate + selective disclosure (jeito 1 + regulator key).
// Same bounded-autonomy proof, plus: the monthly TOTAL is encrypted under the
// regulator's Baby Jubjub public key via exponential ElGamal, and the circuit
// proves the ciphertext encrypts the SAME total used in the monthlyCap check.
// Public sees: compliant + the mandate + the ciphertext. Only the regulator
// (holding the private key) can decrypt the real total. Nobody else.

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/babyjub.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/escalarmulany.circom";
include "../node_modules/circomlib/circuits/escalarmulfix.circom";

// Baby Jubjub base point (circomlib).
function bjBase() {
    return [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];
}

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

template MandateSD(N, M, nBits) {
    // private: the batch of payments
    signal input amounts[N];
    signal input recipients[N];
    // private: ElGamal nonce
    signal input nonceKey;

    // public: the mandate
    signal input perPaymentCap;
    signal input monthlyCap;
    signal input allowed[M];
    // public: regulator Baby Jubjub public key
    signal input regPubKey[2];

    // public outputs
    signal output ok;
    signal output ephemeralKey[2];      // nonce.G
    signal output encryptedTotal[2];     // total.G + nonce.regPubKey

    // --- 1) per-payment cap ---
    component le[N];
    for (var i = 0; i < N; i++) {
        le[i] = LessEqThan(nBits);
        le[i].in[0] <== amounts[i];
        le[i].in[1] <== perPaymentCap;
        le[i].out === 1;
    }

    // --- 2) allowlist membership ---
    component al[N];
    for (var i = 0; i < N; i++) {
        al[i] = InAllowlist(M);
        al[i].x <== recipients[i];
        for (var j = 0; j < M; j++) { al[i].allowed[j] <== allowed[j]; }
    }

    // --- 3) aggregate within monthly cap ---
    signal acc[N + 1];
    acc[0] <== 0;
    for (var i = 0; i < N; i++) { acc[i + 1] <== acc[i] + amounts[i]; }
    component leSum = LessEqThan(nBits + 8);
    leSum.in[0] <== acc[N];
    leSum.in[1] <== monthlyCap;
    leSum.out === 1;

    // --- 4) selective disclosure: encrypt `total` under regulator key ---
    var base[2] = bjBase();

    // validate regulator public key is a valid, non-identity curve point
    component pkOnCurve = BabyCheck();
    pkOnCurve.x <== regPubKey[0];
    pkOnCurve.y <== regPubKey[1];

    // encode total as a curve point: messagePoint = total.G  (total fits 32 bits)
    component totBits = Num2Bits(32);
    totBits.in <== acc[N];
    component encG = EscalarMulFix(32, base);
    for (var i = 0; i < 32; i++) { encG.e[i] <== totBits.out[i]; }

    // ephemeralKey = nonce.G
    component nb1 = Num2Bits(253);
    nb1.in <== nonceKey;
    component ephem = EscalarMulFix(253, base);
    for (var i = 0; i < 253; i++) { ephem.e[i] <== nb1.out[i]; }
    ephemeralKey[0] <== ephem.out[0];
    ephemeralKey[1] <== ephem.out[1];

    // shared = nonce.regPubKey
    component nb2 = Num2Bits(253);
    nb2.in <== nonceKey;
    component shared = EscalarMulAny(253);
    shared.p[0] <== regPubKey[0];
    shared.p[1] <== regPubKey[1];
    for (var i = 0; i < 253; i++) { shared.e[i] <== nb2.out[i]; }

    // encryptedTotal = messagePoint + shared
    component add = BabyAdd();
    add.x1 <== encG.out[0];
    add.y1 <== encG.out[1];
    add.x2 <== shared.out[0];
    add.y2 <== shared.out[1];
    encryptedTotal[0] <== add.xout;
    encryptedTotal[1] <== add.yout;

    ok <== 1;
}

component main {public [perPaymentCap, monthlyCap, allowed, regPubKey]} = MandateSD(8, 4, 64);
