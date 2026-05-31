//! Vote delegation integration tests.

#![cfg(test)]

mod common;

use niffyinsure::{
    types::{ClaimStatus, VoteOption, VOTE_WINDOW_LEDGERS},
    validate::Error as ValidateError,
    NiffyInsureClient,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

fn setup() -> (Env, NiffyInsureClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.sequence_number = 100);
    let contract_id = env.register(niffyinsure::NiffyInsure, ());
    let client = NiffyInsureClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    client.initialize(&admin, &token);
    (env, client, admin, token)
}

fn seed(client: &NiffyInsureClient, holder: &Address, coverage: i128, end_ledger: u32) {
    client.test_seed_policy(holder, &1u32, &coverage, &end_ledger);
}

fn file(client: &NiffyInsureClient, holder: &Address, amount: i128, env: &Env) -> u64 {
    let details = String::from_str(env, "delegation test");
    let ev = common::empty_evidence(env);
    client.file_claim(holder, &1u32, &amount, &details, &ev, &None)
}

#[test]
fn delegated_vote_carries_combined_weight() {
    let (env, client, _, _) = setup();
    let claimant = Address::generate(&env);
    let delegator = Address::generate(&env);
    let delegate = Address::generate(&env);

    seed(&client, &claimant, 1_000_000, 10_000);
    seed(&client, &delegator, 1_000_000, 10_000);
    seed(&client, &delegate, 1_000_000, 10_000);

    let claim_id = file(&client, &claimant, 100_000, &env);
    client.delegate_vote(&delegator, &delegate, &200);

    client.vote_on_claim(&delegate, &claim_id, &VoteOption::Approve);
    let claim = client.get_claim(&claim_id);
    assert_eq!(claim.approve_votes, 2);
    assert_eq!(claim.status, ClaimStatus::Approved);
}

#[test]
fn direct_vote_while_delegated_reverts() {
    let (env, client, _, _) = setup();
    let claimant = Address::generate(&env);
    let delegator = Address::generate(&env);
    let delegate = Address::generate(&env);

    seed(&client, &claimant, 1_000_000, 10_000);
    seed(&client, &delegator, 1_000_000, 10_000);
    seed(&client, &delegate, 1_000_000, 10_000);

    let claim_id = file(&client, &claimant, 100_000, &env);
    client.delegate_vote(&delegator, &delegate, &200);

    let err = client
        .try_vote_on_claim(&delegator, &claim_id, &VoteOption::Approve)
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, ValidateError::VoteDelegated.into());
}

#[test]
fn circular_delegation_attempt_reverts() {
    let (env, client, _, _) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    seed(&client, &a, 1_000_000, 10_000);
    seed(&client, &b, 1_000_000, 10_000);

    client.delegate_vote(&a, &b, &200);
    let err = client.try_delegate_vote(&b, &a, &200).err().unwrap().unwrap();
    assert_eq!(err, ValidateError::CircularDelegation.into());
}

#[test]
fn delegation_expires_and_direct_vote_resumes() {
    let (env, client, _, _) = setup();
    let claimant = Address::generate(&env);
    let delegator = Address::generate(&env);
    let delegate = Address::generate(&env);

    seed(&client, &claimant, 1_000_000, 10_000);
    seed(&client, &delegator, 1_000_000, 10_000);
    seed(&client, &delegate, 1_000_000, 10_000);

    let claim_id = file(&client, &claimant, 100_000, &env);
    let expiry = env.ledger().sequence() + 1;
    client.delegate_vote(&delegator, &delegate, &expiry);

    env.ledger().with_mut(|l| l.sequence_number = expiry + 1);
    client.vote_on_claim(&delegator, &claim_id, &VoteOption::Approve);

    let claim = client.get_claim(&claim_id);
    assert_eq!(claim.approve_votes, 1);
    assert_eq!(claim.status, ClaimStatus::Processing);

    env.ledger()
        .with_mut(|l| l.sequence_number += VOTE_WINDOW_LEDGERS + 1);
    client.finalize_claim(&claim_id);
    assert_eq!(client.get_claim(&claim_id).status, ClaimStatus::Approved);
}
