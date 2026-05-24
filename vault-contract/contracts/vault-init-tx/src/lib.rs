#![no_std]
#![feature(alloc_error_handler)]

extern crate alloc;

use crate::bindings::Account;
use miden::intrinsics::advice::adv_push_mapvaln;
use miden::{felt, tx_script, Word};

#[tx_script]
fn run(_arg: Word, account: &mut Account) {
    // Fixed key for init parameters (must match VAULT_INIT_ADVICE_KEY in src/vault.ts).
    let init_key = Word::from([0_u32, 0, 0, 1]);
    // Browser SDK inserts owner, recipient, and interval felts under that advice-map key.
    let _num_pushed = adv_push_mapvaln(init_key);
    let (_, felts) = miden::pipe_words_to_memory(felt!(3));
    let owner = Word::new([felts[0], felts[1], felts[2], felts[3]]);
    let recipient = Word::new([felts[4], felts[5], felts[6], felts[7]]);
    let interval = felts[8];
    account.init_vault(owner, recipient, interval);
}
