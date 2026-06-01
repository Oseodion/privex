#![no_std]
#![feature(alloc_error_handler)]

extern crate alloc;

use crate::bindings::Account;
use miden::{tx_script, Word};

#[tx_script]
fn run(_arg: Word, account: &mut Account) {
    account.check_in();
}
