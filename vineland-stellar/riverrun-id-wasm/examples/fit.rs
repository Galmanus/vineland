//! CLI helper: print `secret.piece().fit(angle)` as hex.
//!
//! Not part of the crate's proved surface, a thin driver so a shell script can
//! compute a real riverrun ID fit and hand it to `stellar contract invoke`
//! against the live nullifier registry (see `vineland-stellar/demo_anonymous_vote.sh`).
//!
//! Usage: `cargo run --release --example fit -- <64-hex-char secret> <angle:u64>`

use riverrun_id_wasm::{Angle, Secret};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: fit <64-hex-char secret> <angle:u64>");
        std::process::exit(1);
    }
    let secret_bytes = hex_to_32(&args[1]);
    let angle: Angle = args[2].parse().expect("angle must be a u64");
    let secret = Secret::from_bytes(secret_bytes);
    let fit = secret.piece().fit(angle);
    println!("{}", hex_encode(&fit));
}

fn hex_to_32(s: &str) -> [u8; 32] {
    assert_eq!(s.len(), 64, "secret must be 64 hex chars (32 bytes)");
    let mut out = [0u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).expect("invalid hex");
    }
    out
}

fn hex_encode(bytes: &[u8; 32]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
