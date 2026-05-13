// Miden account components must not link the Rust standard library.
#![no_std]
#![feature(alloc_error_handler)]

use miden::{component, felt, tx, Felt, StorageMap, Word};

// -----------------------------------------------------------------------------
// Storage map keys (each key is a fixed Word used with StorageMap<Word, Felt>)
// -----------------------------------------------------------------------------

// First field element of the owner account id (one Word is stored as four Felts).
const STORAGE_KEY_OWNER_LIMB_0: Word =
    Word::new([Felt::ZERO, Felt::ZERO, Felt::ZERO, Felt::ONE]);

// Second field element of the owner account id.
const STORAGE_KEY_OWNER_LIMB_1: Word =
    Word::new([Felt::ZERO, Felt::ZERO, Felt::ZERO, Felt::TWO]);

// Third field element of the owner account id.
const STORAGE_KEY_OWNER_LIMB_2: Word =
    Word::new([Felt::ZERO, Felt::ZERO, Felt::ONE, Felt::ZERO]);

// Fourth field element of the owner account id.
const STORAGE_KEY_OWNER_LIMB_3: Word =
    Word::new([Felt::ZERO, Felt::ZERO, Felt::ONE, Felt::ONE]);

// First field element of the recipient account id.
const STORAGE_KEY_RECIPIENT_LIMB_0: Word =
    Word::new([Felt::ZERO, Felt::ZERO, Felt::ONE, Felt::TWO]);

// Second field element of the recipient account id.
const STORAGE_KEY_RECIPIENT_LIMB_1: Word =
    Word::new([Felt::ZERO, Felt::ZERO, Felt::TWO, Felt::ZERO]);

// Third field element of the recipient account id.
const STORAGE_KEY_RECIPIENT_LIMB_2: Word =
    Word::new([Felt::ZERO, Felt::ZERO, Felt::TWO, Felt::ONE]);

// Fourth field element of the recipient account id.
const STORAGE_KEY_RECIPIENT_LIMB_3: Word =
    Word::new([Felt::ZERO, Felt::ZERO, Felt::TWO, Felt::TWO]);

// Block height by which a check-in is required before the vault can auto-trigger.
const STORAGE_KEY_DEADLINE: Word =
    Word::new([Felt::ZERO, Felt::ONE, Felt::ZERO, Felt::ZERO]);

// Block height of the most recent successful check-in.
const STORAGE_KEY_LAST_CHECKIN: Word =
    Word::new([Felt::ZERO, Felt::ONE, Felt::ZERO, Felt::ONE]);

// Required spacing in blocks between check-ins (also used to extend the deadline).
const STORAGE_KEY_INTERVAL: Word =
    Word::new([Felt::ZERO, Felt::ONE, Felt::ZERO, Felt::TWO]);

// Vault lifecycle flag: 0 active, 1 triggered, 2 closed.
const STORAGE_KEY_STATUS: Word =
    Word::new([Felt::ZERO, Felt::ONE, Felt::ONE, Felt::ZERO]);

// Vault account component. All persisted fields live in one storage map
// so we follow the same pattern as the counter-account example contract.
#[component]
struct VaultContract {
    // Single map from fixed Word keys to Felt values. Logical slots
    // (owner limbs, recipient limbs, deadline, and so on) each use their own key.
    #[storage(description = "vault account storage map")]
    vault_map: StorageMap<Word, Felt>,
}

#[component]
impl VaultContract {
    // Runs once when the vault account is created: records who owns the vault, who receives
    // funds on trigger, how often check-ins are required, and starts counters at zero in the
    // active state.
    pub fn init_vault(&mut self, owner: Word, recipient: Word, interval: Felt) -> Felt {
        let owner_limbs = owner.into_elements();
        self.vault_map
            .set(STORAGE_KEY_OWNER_LIMB_0, owner_limbs[0]);
        self.vault_map
            .set(STORAGE_KEY_OWNER_LIMB_1, owner_limbs[1]);
        self.vault_map
            .set(STORAGE_KEY_OWNER_LIMB_2, owner_limbs[2]);
        self.vault_map
            .set(STORAGE_KEY_OWNER_LIMB_3, owner_limbs[3]);

        let recipient_limbs = recipient.into_elements();
        self.vault_map
            .set(STORAGE_KEY_RECIPIENT_LIMB_0, recipient_limbs[0]);
        self.vault_map
            .set(STORAGE_KEY_RECIPIENT_LIMB_1, recipient_limbs[1]);
        self.vault_map
            .set(STORAGE_KEY_RECIPIENT_LIMB_2, recipient_limbs[2]);
        self.vault_map
            .set(STORAGE_KEY_RECIPIENT_LIMB_3, recipient_limbs[3]);

        self.vault_map.set(STORAGE_KEY_INTERVAL, interval);
        self.vault_map.set(STORAGE_KEY_LAST_CHECKIN, felt!(0));
        self.vault_map.set(STORAGE_KEY_DEADLINE, felt!(0));
        self.vault_map.set(STORAGE_KEY_STATUS, felt!(0));

        felt!(0)
    }

    // Reads the vault lifecycle flag from storage (0 active, 1 triggered, 2 closed).
    pub fn get_status(&self) -> Felt {
        self.vault_map.get(STORAGE_KEY_STATUS)
    }

    // Reads the block height of the last successful check-in from storage.
    pub fn get_last_checkin(&self) -> Felt {
        self.vault_map.get(STORAGE_KEY_LAST_CHECKIN)
    }

    // Reads the block height deadline from storage (must check in before this block).
    pub fn get_deadline(&self) -> Felt {
        self.vault_map.get(STORAGE_KEY_DEADLINE)
    }

    // Tells callers whether the chain has passed the check-in deadline (release path allowed).
    pub fn can_release(&self) -> Felt {
        let deadline = self.vault_map.get(STORAGE_KEY_DEADLINE);

        // A stored deadline of zero means no meaningful deadline is set yet, so do not report release.
        if deadline.as_canonical_u64() == 0 {
            return felt!(0);
        }

        // Reference block for this transaction from the Miden transaction context.
        let current_block = tx::get_block_number();

        // Compare as ordinary unsigned integers so ordering matches block height semantics.
        let current_u = current_block.as_canonical_u64();
        let deadline_u = deadline.as_canonical_u64();

        if current_u > deadline_u {
            felt!(1)
        } else {
            felt!(0)
        }
    }

    // Records a successful check-in from the owner flow: stamps the current block and extends the deadline.
    pub fn check_in(&mut self) -> Felt {
        // Reject the call when the vault is not active (compare the stored status as a plain integer).
        let status = self.vault_map.get(STORAGE_KEY_STATUS);
        assert!(status.as_canonical_u64() == 0);

        // Reference block height for this transaction from the Miden transaction context.
        let current_block = tx::get_block_number();

        // Store that block height as the latest check-in time.
        self.vault_map.set(STORAGE_KEY_LAST_CHECKIN, current_block);

        // Read how many blocks the owner has between required check-ins.
        let interval = self.vault_map.get(STORAGE_KEY_INTERVAL);

        // Add current height and interval using unsigned integers, then convert the sum back to a felt.
        let current_u = current_block.as_canonical_u64();
        let interval_u = interval.as_canonical_u64();
        let new_deadline_u = current_u.checked_add(interval_u).unwrap();
        let new_deadline = Felt::new(new_deadline_u);

        // Persist the next height by which another check-in is required.
        self.vault_map.set(STORAGE_KEY_DEADLINE, new_deadline);

        felt!(0)
    }

    // Marks the vault as triggered once the missed check-in deadline has passed and the vault is still active.
    pub fn set_triggered(&mut self) -> Felt {
        // Require the same release predicate the public can_release helper exposes (must read as integer one).
        let release_ok = self.can_release();
        assert!(release_ok.as_canonical_u64() == 1);

        // Read the current lifecycle flag so we can refuse a second trigger while already fired or closed.
        let status = self.vault_map.get(STORAGE_KEY_STATUS);
        assert!(status.as_canonical_u64() == 0);

        // Persist the triggered state so downstream logic knows the vault already fired.
        self.vault_map.set(STORAGE_KEY_STATUS, felt!(1));

        felt!(0)
    }
}
