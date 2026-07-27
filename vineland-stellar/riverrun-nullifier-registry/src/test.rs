//! Tests for riverrun-nullifier-registry: the double-spend / one-action-per-
//! -context guard. No auth is exercised because the contract requires none, by
//! design (see module docs for why).

#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::BytesN as _, Env};

fn deploy(env: &Env) -> NullifierRegistryClient<'_> {
    let id = env.register(NullifierRegistry, ());
    NullifierRegistryClient::new(env, &id)
}

#[test]
fn a_fresh_angle_fit_pair_is_not_spent() {
    let env = Env::default();
    let client = deploy(&env);
    let fit = BytesN::<32>::random(&env);
    assert!(!client.is_spent(&7u64, &fit));
}

#[test]
fn submitting_a_fit_records_it_as_spent() {
    let env = Env::default();
    let client = deploy(&env);
    let fit = BytesN::<32>::random(&env);
    client.submit_fit(&7u64, &fit);
    assert!(client.is_spent(&7u64, &fit));
}

#[test]
fn submitting_the_same_fit_twice_at_the_same_angle_fails() {
    let env = Env::default();
    let client = deploy(&env);
    let fit = BytesN::<32>::random(&env);
    client.submit_fit(&7u64, &fit);
    let result = client.try_submit_fit(&7u64, &fit);
    assert_eq!(result.err().unwrap().unwrap(), Error::AlreadySpent.into());
}

#[test]
fn the_same_fit_at_a_different_angle_is_independent() {
    // Same fit bytes, different angle: riverrun ID never produces this in
    // practice (fit is domain-separated by angle), but the registry's guard is
    // per-(angle, fit) precisely so a collision here still cannot happen.
    let env = Env::default();
    let client = deploy(&env);
    let fit = BytesN::<32>::random(&env);
    client.submit_fit(&7u64, &fit);
    assert!(!client.is_spent(&8u64, &fit), "spending at angle 7 must not spend angle 8");
    client.submit_fit(&8u64, &fit);
    assert!(client.is_spent(&8u64, &fit));
}

#[test]
fn two_different_fits_at_the_same_angle_are_independent() {
    let env = Env::default();
    let client = deploy(&env);
    let fit_a = BytesN::<32>::random(&env);
    let fit_b = BytesN::<32>::random(&env);
    client.submit_fit(&7u64, &fit_a);
    assert!(client.is_spent(&7u64, &fit_a));
    assert!(!client.is_spent(&7u64, &fit_b), "spending one fit must not spend a different one");
}

#[test]
fn submit_fit_requires_no_authorization() {
    // The contract intentionally calls no require_auth; env.require_auths
    // being empty and the call still succeeding is the check.
    let env = Env::default();
    let client = deploy(&env);
    let fit = BytesN::<32>::random(&env);
    client.submit_fit(&7u64, &fit);
    assert_eq!(env.auths(), &[]);
}
