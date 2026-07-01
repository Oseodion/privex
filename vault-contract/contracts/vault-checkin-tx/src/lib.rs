#![no_std]
#![feature(alloc_error_handler)]

use miden::{account, tx_script, Word};

// Typed wrapper for the vault account component, used to call its exported check_in method.
#[account(vault_account::VaultContractInterface)]
struct VaultAccount;

#[tx_script]
fn run(_arg: Word, account: &mut VaultAccount) {
    account.check_in();
}
