# Privex - Technical Reference

## Architecture

### How Privex Works

Privex is a check-in based dead-man's switch for crypto assets. The owner creates
a vault (a private Miden account), sets a recipient and a check-in interval, then
periodically sends a check-in transaction to prove they are still alive and in control.
If the deadline passes without a check-in, the vault can be triggered and assets
released to the recipient.

The entire lifecycle is private by default because Miden accounts are private — their
storage, asset balances, and transaction history are not visible on-chain. Only a
cryptographic commitment is stored on the ledger.

### Smart Contract Structure

All contracts live in `vault-contract/contracts/`. Each is an independent Rust crate
compiled with `cargo miden build` to a `.masp` (Miden Account Script Package) artifact.

#### `vault-account` — the vault contract

An account component (`#[component]`) that holds all vault state in a single
`StorageMap<Word, Felt>`. Keys are fixed Word constants; values are Felt scalars.

Storage layout:

| Key constant | Meaning |
|---|---|
| `STORAGE_KEY_OWNER_LIMB_0..3` | Owner account ID split across four Word keys (one Felt per limb) |
| `STORAGE_KEY_RECIPIENT_LIMB_0..3` | Recipient account ID, same layout |
| `STORAGE_KEY_INTERVAL` | Check-in interval in blocks |
| `STORAGE_KEY_LAST_CHECKIN` | Block height of the last successful check-in |
| `STORAGE_KEY_DEADLINE` | Block height by which the next check-in must arrive |
| `STORAGE_KEY_STATUS` | Lifecycle flag: 0 active, 1 triggered, 2 closed |

Public methods: `init_vault`, `get_status`, `get_last_checkin`, `get_deadline`,
`can_release`, `check_in`, `set_triggered`.

`can_release` compares `STORAGE_KEY_DEADLINE` against `tx::get_block_number()`.
`check_in` writes the current block as `LAST_CHECKIN` and extends the deadline by
one interval. Both use `as_canonical_u64()` for all comparisons because Felt
arithmetic is modular — raw comparison operators do not reflect natural ordering.

#### `vault-init-tx` — transaction script that initializes a vault

A `#[tx_script]` that reads an advice map at key `Word::from([0,0,0,1])`, unpacks
twelve Felts (owner Word, recipient Word, interval Felt (felts[8]); felts[9..11] are unused), and
calls `account.init_vault(owner, recipient, interval)`. The executing account is the
newly-created vault account.

#### `vault-checkin-tx` — transaction script that records a check-in

A minimal `#[tx_script]` that calls `account.check_in()` on the vault account. No
advice map is needed because `check_in` reads everything it needs (block height,
stored interval) from vault storage and the transaction context.

Built artifacts (`.masp` files) are committed to `src/assets/` and `public/assets/`
so Vite can serve them. They are fetched at runtime before each transaction.

### Frontend Architecture

Vanilla TypeScript, no React, no component framework. Vite bundles the code and
handles `.masp` binary assets as static files via `public/`.

Key modules:

| File | Responsibility |
|---|---|
| `src/main.ts` | DOM wiring, screen routing, event delegation, bootstrap |
| `src/wallet.ts` | `MidenClient` lifecycle (init, sync, get) |
| `src/vault.ts` | `createVault`, `checkIn`, `getUserVaults`, `getVaultStatus` |
| `src/checkin.ts` | `sendCheckIn` wrapper that dispatches DOM events |
| `src/vault-records.ts` | Zero-dependency localStorage persistence, keyed by wallet address |
| `src/account.ts` | `getConnectedAccountId`, `setConnectedAccountId`, `loadSavedAccountId` |

The `vault-records.ts` module is intentionally isolated from all SDK imports. This is
critical: extension users never touch the Miden SDK, so any module that extension code
imports must not pull in `@miden-sdk/miden-sdk` or the 14 MB WASM will be fetched at
connect time and time out the extension handshake.

Code splitting via Vite dynamic imports (`await import("./vault")`) keeps WASM out of
the critical connect path. Vault and wallet chunks load on demand after the user is
already connected.

### Miden Wallet Extension Integration

The Miden Wallet browser extension exposes `window.midenWallet`. The relevant surface:

```typescript
window.midenWallet.connect(permission, network, allowedPrivateData)
window.midenWallet.requestTransaction({ type, payload: { address, recipientAddress, transactionRequest } })
```

`transactionRequest` is the serialized `TransactionRequest` object encoded as base64.
The extension signs and submits the transaction using the key it manages for `address`.

For vault creation:
- The vault account is built locally in WASM (`AccountBuilder`) before any extension call
- The extension signs the `init_vault` transaction as the owner account (who pays fees)
- `address` in the payload is the vault account ID; `recipientAddress` is the owner

For check-in:
- `address` is the owner's wallet address (the account whose key the extension holds)
- `recipientAddress` is the vault account ID (the account the script executes against)

The connect flow polls `window.midenWallet.permission.address` every 500 ms for up to
90 seconds waiting for the extension to confirm the connection. This loop lives in
`waitForExtensionConnect` in `main.ts`.

SDK version: `@miden-sdk/miden-sdk@^0.14.10`
Rust SDK version: `miden = "0.12"`

---

## Current Status

### Fully Working

- Extension connect via Miden Wallet Chrome extension
- Dashboard loads vault records from localStorage for extension users
- Vault creation (extension path): builds vault account locally, calls `init_vault`
  via `requestTransaction`, saves vault record to localStorage on confirmed response
- Vault card UI: truncated ID with copy button, status badge, interval banner,
  orange full-width Check In button
- Check-in transaction (extension path): fetches `vault_checkin.masp`, builds
  `TransactionRequest`, submits via extension signed as owner wallet
- Per-wallet localStorage vault records: keyed by `privex_vaults_<address>`,
  survive page refresh and session end
- Landing page: How It Works, Use Cases (two active, two marked Coming Soon),
  Why Miden comparison table, CTA
- Light / dark theme toggle
- Wallet address dropdown with copy and disconnect

### Partially Working

- **Vault creation (developer / Account ID path)**: `createVaultWithClient` is
  implemented and compiles, but testnet RPC sync frequently fails with a Protobuf
  wire type error from the Miden node. The 300-second remote prover timeout means
  users wait 5 minutes before seeing a failure.
- **`getUserVaults` (RPC path)**: fetches the template account's code commitment and
  scans local accounts for matching code. Works in theory but returns empty in
  practice because the template account is private and `getOrImport` cannot read its
  code commitment.
- **`getVaultStatus`**: calls `client.accounts.getDetails` then tries to read storage
  slots by name. Will fail because all vault data lives inside a single `StorageMap`
  at slot `vault_map` — there are no named top-level slots matching the candidate
  names the function searches for. All fields return `"unknown"`.

### Not Yet Implemented

- **Asset locking**: `createVault` accepts an `amount` parameter, validates it, but
  never uses it. No tokens are transferred to the vault account. The TODO in
  `vault.ts` reads: "Lock assets into vault — send amount tokens from owner wallet to
  vault account after init_vault succeeds. This requires a separate send transaction."
- **Check-in (developer / RPC path)**: `checkIn` syncs the client then throws
  `"Check-in is not implemented yet for the non-extension path."` No RPC-based
  check-in transaction submission exists.
- **Automatic vault trigger**: `set_triggered` and `can_release` are implemented in
  the Rust contract but nothing in the frontend calls them.
- **Asset release / payout to recipient**: the contract marks status as triggered but
  there is no transaction script to move assets out of the vault to the recipient.
- **Vault modification**: no transaction script for updating recipient, interval, or
  cancelling the vault.
- **Goal-based and recurring-transfer vault types**: marked Coming Soon on the landing
  page; no contract design exists yet.

---

## Known Issues

### Extension Connect Timeout

When MetaMask or another wallet extension is installed alongside Miden Wallet, the
90-second polling loop (`waitForExtensionConnect`) sometimes never sees
`window.midenWallet.permission.address` update. The connect button spins for the full
timeout then shows "Connection timed out." Root cause is not fully understood — likely
the extension's content script is delayed by other extensions' startup scripts. The
UI now shows an amber warning banner when `window.ethereum` is detected, advising
users to disable other extensions.

### Testnet Node Sync Errors

The RPC path (`MidenClient.createTestnet()` → `client.sync()`) fails with a Protobuf
wire type error originating from the Miden node. This is a testnet infrastructure
issue, not a code bug. It makes the non-extension (developer) path unreliable.

### Asset Locking Not Implemented

The vault creation form accepts an "Amount to lock" field. The value is validated but
completely ignored — no assets are sent to the vault. A user filling in `10.0` on the
form does not lock anything. This is documented with a TODO comment in `vault.ts`.

### Vault Status Cannot Be Read

`getVaultStatus` will always return all fields as `"unknown"` for any vault created by
this app. The function looks for named top-level storage slots (`"status"`,
`"last_checkin"`, etc.) but the contract stores everything inside a single `StorageMap`
at the slot name `vault_map`. Reading individual values from the map requires calling
the contract's getter methods (`get_status`, `get_last_checkin`, `get_deadline`,
`can_release`), not slot name lookups. This requires a transaction or a MASM-level
call, neither of which the TypeScript SDK exposes directly via `getDetails`.

### getUserVaults Returns Empty for Private Accounts

Private Miden accounts cannot have their code commitment read from the network. The
`getUserVaults` function relies on comparing a user's local accounts against the
template account's code commitment. Because the template (`0x1bb25f2739ce6180529dcc939df797`)
is a private account, `client.accounts.getOrImport` cannot retrieve its code, so the
comparison always fails and an empty list is returned. This is worked around for
extension users by falling back to localStorage vault records.

---

## What We Would Change

### Move to React with official Miden wallet adapter

The current vanilla TypeScript approach works but results in verbose DOM manipulation
in `main.ts` (980+ lines). React components with hooks would make the vault card,
dashboard, and connect screen much easier to extend. The Miden team is building an
official wallet adapter; integrating it would replace the fragile `window.midenWallet`
polling with a proper provider pattern.

### Implement asset locking with consume-notes

The correct pattern for locking assets is:
1. Create a P2ID note from the owner to the vault account with the desired asset
2. Execute a consume-note transaction on the vault to pull the asset in

This requires two transactions and understanding Miden's note consumption model. The
current implementation skips both and leaves the vault empty.

### Fix vault status reading

Replace `getVaultStatus`'s slot-name guessing with a transaction script that calls
the contract's getter methods (`get_status`, `get_last_checkin`, `get_deadline`) and
returns their values via the output stack. Alternatively, index vault state into a
local SQLite store (the Miden SDK uses IndexedDB) and query it locally after sync.

### Add vault status polling

Show live vault state on the dashboard — current block height, blocks until deadline,
triggered/active/closed status. This requires either SDK access (extension users
currently have none after connect) or a dedicated read-only RPC call.

### Add check-in history

Store each check-in transaction ID in localStorage alongside the vault record. Display
the last N check-ins on the vault card so users can verify their check-ins are landing
on-chain.

---

## Testnet Activity

### Deployed Contract

| | |
|---|---|
| Vault template account | `0x1bb25f2739ce6180529dcc939df797` |
| Explorer | https://testnet.midenscan.com/account/0x1bb25f2739ce6180529dcc939df797 |
| Builder wallet | `0x8a149e66015e5b8054d648a6bc80d4` |
| Explorer | https://testnet.midenscan.com/account/0x8a149e66015e5b8054d648a6bc80d4 |

### Known Transactions

| Hash | Action |
|---|---|
| `0x178f52e8848ce57e4dadc077d36d42791ec4b4f9d0fd33f12539e492be510762` | Send transaction (100 tokens) |
| `0x34c5fdbb1ccb622209d3b6308a700fee3778a69ac944cebcea42da4ac8c1f9da` | Send transaction (50 tokens) |
