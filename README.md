# Privex

> Private automated asset control protocol built on Miden blockchain.

## The Problem

Every blockchain transaction is public by default. When you move assets on
Ethereum or Solana, anyone can see your wallet, your amounts, your recipients,
and your timing. This creates real problems:

- Employers see contractor salaries and drama follows
- Traders get front-run because their moves are visible
- OTC deals fall apart because chain analysis exposes both parties
- There is no way to set automated asset rules without revealing everything

## The Solution

Privex is a private automated asset control protocol built on Miden. Users
lock assets into private smart contracts, set conditions, and the contract
executes automatically when those conditions are met. Nobody sees the amounts,
the recipients, or the conditions until execution.

Everything is private by default. This is only possible on Miden because of
its ZK architecture and client-side proving model.

## How It Works

### The Three Miden Primitives Privex Uses

- **Accounts** - smart contracts that hold assets and run logic
- **Notes** - programmable messages that move assets between accounts
- **Assets** - fungible tokens locked inside vault contracts

### The Flow

1. User connects their Miden wallet
2. User creates a vault and locks assets inside it
3. User sets private conditions - time based, activity based, or goal based
4. User sends a check-in signal regularly to keep the vault active
5. If conditions are met, the contract executes automatically
6. Assets release to recipient wallets via private Notes
7. Nobody outside the vault ever sees amounts, recipients, or conditions

### Why This Only Works On Miden

| Feature | Ethereum / Solana | Privex on Miden |
|---|---|---|
| Vault contents hidden | Public | Sealed |
| Recipient hidden | Visible | Private |
| No middleman | Requires trust | Trustless |
| Auto execution | Manual | Automatic |
| Quantum safe | Vulnerable | Protected |
| MEV resistant | Exposed | Native |

On transparent chains, setting up an automated asset rule is like posting your
will on Twitter. On Miden, the vault exists onchain but nobody can read it.

## Use Cases

- **The Traveller** - going offline for months, assets auto-move to cold wallet if you stop checking in
- **Time Locked Transfer** - lock assets to release on a specific date privately
- **Deal Escrow** - two parties lock funds, both confirm, funds release automatically
- **Goal Based Release** - lock a grant or bounty, releases when onchain action is verified
- **Recurring Private Transfers** - pay contributors on a schedule with no visible amounts
- **Backup Wallet Protection** - auto-shift holdings to backup wallet if main goes quiet

## Transaction Volume

Every user action creates real onchain transactions:

| Action | Transactions |
|---|---|
| Create wallet | 1 |
| Deploy vault contract | 1 |
| Lock assets | 1-5 |
| Set conditions | 1 |
| Monthly check-in | 1 per month |
| Modify vault | 1-2 |
| Execute release | 1-5 |

A single active user generates 20+ transactions per year just from check-ins alone.

## Project Structure
privex/
contracts/          - Rust smart contracts for Miden VM
vault/            - vault creation and asset locking
checkin/          - check-in signal contract
execute/          - condition evaluation and release
src/
wallet.ts         - Miden wallet connection
vault.ts          - vault creation and management
checkin.ts        - check-in transaction logic
ui/               - frontend HTML and CSS
tests/              - contract and integration tests
CLAUDE.md           - AI coding context and rules
README.md           - this file

## Tech Stack

- **Miden blockchain** - ZK rollup with client-side proving, private by default
- **Miden SDK** - TypeScript SDK for frontend and wallet interactions
- **Rust** - smart contracts written for the Miden VM
- **pnpm** - secure package manager with 7-day release age block

## Security

- All vault contents sealed using Miden's native ZK proof system
- Transactions executed locally on user device, only proof hits the chain
- No server, no backend, no trusted third party at any step
- Quantum resistant architecture via Miden's post-quantum cryptography

## Network

- **Chain:** Miden testnet
- **Toolchain:** stable 0.14.0
- **Status:** Active development

## Developer

Built by [@Oseodion](https://github.com/Oseodion) on Miden testnet.