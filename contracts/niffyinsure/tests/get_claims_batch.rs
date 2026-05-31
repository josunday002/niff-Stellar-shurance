#![cfg(test)]

mod common;

use niffyinsure::{
    storage,
    types::{
        Claim, ClaimStatus, ClaimStatusHistoryEntry, CLAIM_BATCH_GET_MAX,
    },
    validate::Error as ValidateError,
    NiffyInsureClient,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

fn setup() -> (Env, NiffyInsureClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(niffyinsure::NiffyInsure, ());
    let client = NiffyInsureClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    client.initialize(&admin, &token);
    (env, client, token)
}

fn seed_claim(env: &Env, client: &NiffyInsureClient<'_>, token: &Address, claim_id: u64) {
    let claimant = Address::generate(env);
    let claim = Claim {
        claim_id,
        policy_id: 1,
        claimant,
        amount: 100_000,
        deductible: 0,
        asset: token.clone(),
        details: String::from_str(env, "batch claim"),
        evidence: common::empty_evidence(env),
        status: ClaimStatus::Processing,
        voting_deadline_ledger: 10_000,
        payout_deadline_ledger: 0,
        approve_votes: 0,
        reject_votes: 0,
        filed_at: 1,
        eligible_voter_count: 0,
        appeal_open_deadline_ledger: 0,
        appeals_count: 0,
        appeal_deadline_ledger: 0,
        appeal_approve_votes: 0,
        appeal_reject_votes: 0,
        status_history: Vec::<ClaimStatusHistoryEntry>::new(env),
    };

    env.as_contract(&client.address, || {
        storage::set_claim(env, &claim);
    });
}

#[test]
fn get_claims_batch_empty_input() {
    let (env, client, _) = setup();
    let ids = Vec::new(&env);
    let out = client.get_claims_batch(&ids);
    assert_eq!(out.len(), 0u32);
}

#[test]
fn get_claims_batch_full_batch_all_hits() {
    let (env, client, token) = setup();
    for id in 1..=CLAIM_BATCH_GET_MAX {
        seed_claim(&env, &client, &token, id as u64);
    }

    let mut ids = Vec::new(&env);
    for id in 1..=CLAIM_BATCH_GET_MAX {
        ids.push_back(id as u64);
    }

    let out = client.get_claims_batch(&ids);
    assert_eq!(out.len(), CLAIM_BATCH_GET_MAX);
    for i in 0..CLAIM_BATCH_GET_MAX {
        let claim = out.get(i).unwrap().unwrap();
        assert_eq!(claim.claim_id, (i + 1) as u64);
    }
}

#[test]
fn get_claims_batch_partial_hits_keep_none_positions() {
    let (env, client, token) = setup();
    seed_claim(&env, &client, &token, 1);
    seed_claim(&env, &client, &token, 3);

    let mut ids = Vec::new(&env);
    ids.push_back(1u64);
    ids.push_back(2u64);
    ids.push_back(3u64);

    let out = client.get_claims_batch(&ids);
    assert_eq!(out.len(), 3u32);
    assert_eq!(out.get(0).unwrap().unwrap().claim_id, 1);
    assert!(out.get(1).unwrap().is_none());
    assert_eq!(out.get(2).unwrap().unwrap().claim_id, 3);
}

#[test]
fn get_claims_batch_over_cap_reverts() {
    let (env, client, _) = setup();
    let mut ids = Vec::new(&env);
    for id in 0..=CLAIM_BATCH_GET_MAX {
        ids.push_back(id as u64);
    }

    let err = client.try_get_claims_batch(&ids).err().unwrap().unwrap();
    assert_eq!(err, ValidateError::ClaimBatchTooLarge.into());
}
