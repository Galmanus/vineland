// Vineland — threshold selective disclosure via the M-of-N committee (Mamalujo).
//
// The regulator-disclosure key is NOT held by one party. It is generated as a
// shared key over the committee: the private key is Shamir-secret-shared among the
// N committee members, and recovering a disclosed value requires M of them to each
// contribute a partial decryption. Below M, nobody — not even the operator — can
// de-anonymize. This is the compliant-privacy keystone: lawful disclosure is a
// quorum, exactly like the on-chain Mamalujo committee that attests execution.
//
// Construction: exponential ElGamal over Baby Jubjub (the same curve slippay-zk's
// mandate_sd encrypts the regulator total under), with Shamir sharing of the
// decryption key and Lagrange-in-the-exponent threshold decryption.
//
// COMPLIANCE / MATURITY NOTE: Baby Jubjub is an elliptic curve — this disclosure
// channel is CLASSICAL, not post-quantum (see FUSION.md). A trusted dealer creates
// the shares here; a full distributed key generation (no dealer) is roadmap.

const crypto = require("crypto");
const { buildBabyjub } = require("circomlibjs");

// --- scalar-field (subgroup order) modular arithmetic --------------------------
function mod(a, n) {
  return ((a % n) + n) % n;
}
function randScalar(n) {
  // uniform-ish scalar in [1, n): 32 random bytes reduced mod n
  const r = BigInt("0x" + crypto.randomBytes(32).toString("hex"));
  return mod(r, n) || 1n;
}
function modInv(a, n) {
  // extended Euclid
  let [old_r, r] = [mod(a, n), n];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, n);
}

// Shamir: split secret into n shares, threshold m (polynomial of degree m-1).
function shamirSplit(secret, n, m, L) {
  const coeffs = [secret];
  for (let i = 1; i < m; i++) coeffs.push(randScalar(L));
  const shares = [];
  for (let x = 1n; x <= BigInt(n); x++) {
    let y = 0n;
    for (let j = coeffs.length - 1; j >= 0; j--) y = mod(y * x + coeffs[j], L);
    shares.push({ x, y });
  }
  return shares;
}

// Lagrange coefficient of share x_i at 0, over the index set S (mod L).
function lagrangeAtZero(xi, S, L) {
  let num = 1n, den = 1n;
  for (const xj of S) {
    if (xj === xi) continue;
    num = mod(num * mod(-xj, L), L);
    den = mod(den * mod(xi - xj, L), L);
  }
  return mod(num * modInv(den, L), L);
}

async function main() {
  const bj = await buildBabyjub();
  const F = bj.F;
  const L = bj.subOrder; // prime order of the Base8 subgroup
  const G = bj.Base8;
  const eq = (P, Q) => F.eq(P[0], Q[0]) && F.eq(P[1], Q[1]);

  const N = 3, M = 2;              // committee of three, quorum of two
  const secretMsg = 42n;          // the disclosed value (a bounded number, e.g. an amount)
  const RANGE = 1000n;            // recovery searches 0..RANGE

  // 1) committee key: private key s, shared M-of-N; public key PK = s.G
  const s = randScalar(L);
  const PK = bj.mulPointEscalar(G, s);
  const shares = shamirSplit(s, N, M, L);

  // 2) encrypt the value to the committee's shared public key (exponential ElGamal)
  const r = randScalar(L);
  const eph = bj.mulPointEscalar(G, r);                               // r.G
  const mG = bj.mulPointEscalar(G, secretMsg);                        // m.G
  const c2 = bj.addPoint(mG, bj.mulPointEscalar(PK, r));              // m.G + r.PK
  const cipher = { eph, c2 };

  // 3) threshold decrypt with a quorum S: each member contributes share_i . eph,
  //    combined by Lagrange-in-the-exponent to reconstruct r.PK = s.(r.G).
  function reconstruct(S) {
    const members = shares.filter((sh) => S.includes(Number(sh.x)));
    const Sx = members.map((sh) => sh.x);
    let acc = null; // point at infinity
    for (const sh of members) {
      const lam = lagrangeAtZero(sh.x, Sx, L);
      const partial = bj.mulPointEscalar(cipher.eph, mod(sh.y * lam, L)); // (lam.share).eph
      acc = acc === null ? partial : bj.addPoint(acc, partial);
    }
    return acc; // = r.PK when |S| >= M and shares are consistent
  }
  function recover(S) {
    const rPK = reconstruct(S);
    // m.G = c2 - r.PK ; subtract by adding the inverse point (L-1).rPK, then
    // brute-force the bounded disclosed value.
    const invRPK = bj.mulPointEscalar(rPK, mod(-1n, L));
    const target = bj.addPoint(cipher.c2, invRPK);
    for (let m = 0n; m <= RANGE; m++) {
      if (eq(bj.mulPointEscalar(G, m), target)) return m;
    }
    return null;
  }

  const q12 = recover([1, 2]);
  const q13 = recover([1, 3]);
  const q23 = recover([2, 3]);
  const solo = recover([1]); // below threshold

  const pass =
    q12 === secretMsg && q13 === secretMsg && q23 === secretMsg && solo !== secretMsg;

  console.log(`committee N=${N}, quorum M=${M}, disclosed value = ${secretMsg}`);
  console.log(`  quorum {1,2} recovers: ${q12}`);
  console.log(`  quorum {1,3} recovers: ${q13}`);
  console.log(`  quorum {2,3} recovers: ${q23}`);
  console.log(`  single {1}   recovers: ${solo}  (must NOT be ${secretMsg})`);
  console.log(pass ? "PASS: M-of-N discloses, M-1 cannot." : "FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
