#![no_std]

//! Vineland ZK — generic Groth16 verifier on BN254 (native host functions, X-Ray).
//! Verifies a snarkjs/circom Groth16 proof over BN254. All inputs are raw bytes
//! so the contract can be invoked directly with the artifacts emitted by snarkjs.
//!
//! Byte formats (big-endian, matching soroban `from_bytes`):
//!   G1 = x(32) || y(32)                       (64 bytes)
//!   G2 = x.c1(32) || x.c0(32) || y.c1(32) || y.c0(32)   (128 bytes)
//!   Fr = scalar, 32 bytes big-endian
//!
//! Verifies: e(-A,B) * e(alpha,beta) * e(vk_x,gamma) * e(C,delta) == 1,
//! where vk_x = IC[0] + sum_i pub[i] * IC[i+1].

use soroban_sdk::{
    contract, contractimpl,
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr},
    vec, BytesN, Env, Vec,
};

#[contract]
pub struct VinelandZkVerifier;

#[contractimpl]
impl VinelandZkVerifier {
    pub fn verify(
        env: Env,
        alpha: BytesN<64>,
        beta: BytesN<128>,
        gamma: BytesN<128>,
        delta: BytesN<128>,
        ic: Vec<BytesN<64>>,
        a: BytesN<64>,
        b: BytesN<128>,
        c: BytesN<64>,
        pubs: Vec<BytesN<32>>,
    ) -> bool {
        let bn = env.crypto().bn254();

        // SOUNDNESS: the number of public inputs MUST match the verification key.
        // Without this, extra IC points are silently ignored and a prover could
        // omit public inputs (e.g. the regulator key or a cap) and still verify.
        if ic.len() != pubs.len() + 1 {
            return false;
        }

        // vk_x = IC[0] + sum_i pubs[i] * IC[i+1]
        let mut vk_x = Bn254G1Affine::from_bytes(ic.get(0).unwrap());
        let n = pubs.len();
        for i in 0..n {
            let s = Fr::from_bytes(pubs.get(i).unwrap());
            let icp = Bn254G1Affine::from_bytes(ic.get(i + 1).unwrap());
            let prod = bn.g1_mul(&icp, &s);
            vk_x = bn.g1_add(&vk_x, &prod);
        }

        let neg_a = -Bn254G1Affine::from_bytes(a);
        let g1s = vec![
            &env,
            neg_a,
            Bn254G1Affine::from_bytes(alpha),
            vk_x,
            Bn254G1Affine::from_bytes(c),
        ];
        let g2s = vec![
            &env,
            Bn254G2Affine::from_bytes(b),
            Bn254G2Affine::from_bytes(beta),
            Bn254G2Affine::from_bytes(gamma),
            Bn254G2Affine::from_bytes(delta),
        ];
        bn.pairing_check(g1s, g2s)
    }
}
