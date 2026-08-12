import type {
  AccountHeader,
  AccountStorage,
  MidenClient,
} from "@miden-sdk/miden-sdk";
import { AccountId } from "@miden-sdk/miden-sdk";
import { getConnectedAccountId } from "./account";
import { getClient, initClient } from "./wallet";
import { saveVaultRecord } from "./vault-records";

export type { VaultRecord } from "./vault-records";
export { saveVaultRecord, loadVaultRecords } from "./vault-records";

/**
 * Deployed Privex vault template account on Miden testnet.
 * New user vaults should share this account's code commitment once creation is wired up.
 */
export const VAULT_CONTRACT_ACCOUNT_ID =
  "0x1bb25f2739ce6180529dcc939df797";

/** Miden Wallet browser extension surface used to send check-in transactions. */
interface MidenWalletExtension {
  requestSend?: (send: {
    address: string;
    amount: number;
  }) => Promise<{ transactionId?: string }>;
  waitForTransaction?: (txId: string) => Promise<unknown>;
}

/**
 * True when the page can submit a send transaction via the wallet extension.
 */
function canUseMidenWalletExtension(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const wallet = (window as { midenWallet?: MidenWalletExtension }).midenWallet;
  return wallet !== undefined && typeof wallet.requestSend === "function";
}

/** Number of random bytes in a generated vault id (30 hex chars, like a Miden account id). */
const VAULT_ID_BYTE_LENGTH = 15;

/**
 * Generates a random hex id for a locally tracked vault. This is not an on-chain
 * account id - it is only a stable key for the localStorage vault record.
 */
function generateVaultId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(VAULT_ID_BYTE_LENGTH));
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
}

/** Token amount sent to self as the proof-of-life signal. */
const CHECKIN_AMOUNT = 1;

/**
 * Sends a check-in via the Miden Wallet extension. The owner sends a small amount
 * to their own address as proof of life; the transaction id is the check-in receipt.
 * The vault id is not used on chain - vaults are tracked locally.
 */
async function createCheckinWithExtension(vaultId: string): Promise<string> {
  void vaultId;
  const wallet = (window as unknown as { midenWallet?: MidenWalletExtension })
    .midenWallet;
  if (wallet === undefined || typeof wallet.requestSend !== "function") {
    throw new Error("Miden Wallet extension is not available.");
  }

  const ownerAddress = getConnectedAccountId();
  if (ownerAddress === null || ownerAddress.trim().length === 0) {
    throw new Error("No connected wallet.");
  }

  // Send 1 token to self as proof of life check-in
  const result = await wallet.requestSend({
    address: ownerAddress,
    amount: CHECKIN_AMOUNT,
  });

  const txId = result?.transactionId ?? "";
  if (txId.length === 0) {
    throw new Error("Check-in transaction was rejected.");
  }
  return txId;
}

/**
 * Returns the connected Miden client, initializing testnet if the page was
 * refreshed with a saved account but initClient was not run yet.
 */
async function getOrInitClient(): Promise<MidenClient> {
  try {
    return getClient();
  } catch {
    return initClient();
  }
}

/**
 * Shape of vault status returned to the UI.
 * Values are plain strings or numbers until the contract storage map is finalized.
 */
export interface VaultStatus {
  status: string;
  lastCheckin: string;
  deadline: string;
  canRelease: number;
}

/**
 * Compare two account id strings in a stable way for filtering.
 */
function normalizeAccountIdHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

/**
 * Parses a connected account id string into an AccountId (hex or bech32).
 */
function parseAccountId(value: string, label: string): AccountId {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`);
  }
  try {
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      return AccountId.fromHex(trimmed);
    }
    return AccountId.fromBech32(trimmed);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ${label}: ${detail}`);
  }
}

/**
 * Reads a single-word storage slot if a matching slot name exists.
 */
function readWordSlot(
  storage: AccountStorage,
  candidateNames: readonly string[]
): string {
  const slotNames = storage.getSlotNames();
  for (const candidate of candidateNames) {
    const match = slotNames.find(
      (name) => name.toLowerCase() === candidate.toLowerCase()
    );
    if (match === undefined) {
      continue;
    }
    const word = storage.getItem(match);
    if (word !== undefined) {
      return word.toHex();
    }
  }
  return "";
}

/**
 * Parses a word hex string into 0 or 1 for boolean-like flags. Unknown values become 0.
 */
function parseFlagWord(hex: string): number {
  if (hex.length === 0) {
    return 0;
  }
  const normalized = hex.replace(/^0x/, "").toLowerCase();
  const last = normalized.replace(/^0+/, "").slice(-1);
  if (last === "1") {
    return 1;
  }
  return 0;
}

/**
 * Creates a vault record and tracks it locally. No on-chain transaction and no
 * wallet extension popup happens here - the vault is only a local record until
 * the owner sends a check-in, which is the real on-chain transaction.
 * Returns the generated vault id.
 */
export async function createVault(
  recipient: string,
  interval: number,
  amount: number
): Promise<string> {
  try {
    const trimmedRecipient = recipient.trim();
    if (trimmedRecipient.length === 0) {
      throw new Error("Recipient wallet address is required.");
    }
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new Error("Check-in interval must be a positive number.");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Amount to lock must be a positive number.");
    }
    // Reject a recipient that is not a valid Miden account id before saving it.
    parseAccountId(trimmedRecipient, "Recipient account");

    const ownerIdStr = getConnectedAccountId();
    if (ownerIdStr === null || ownerIdStr.trim().length === 0) {
      throw new Error(
        "No connected wallet. Connect your account before creating a vault."
      );
    }

    // TODO: Lock assets into vault - send amount tokens from owner wallet to the
    // vault once vault creation is wired to an on-chain transaction again.

    const vaultId = generateVaultId();
    saveVaultRecord(
      {
        id: vaultId,
        recipient: trimmedRecipient,
        interval,
        createdAt: Date.now(),
        ownerAddress: ownerIdStr,
      },
      ownerIdStr
    );
    return vaultId;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not create a vault. ${detail}`);
  }
}

/**
 * Loads vault account storage after sync and maps it into a small status object for the UI.
 */
export async function getVaultStatus(
  vaultAccountId: string
): Promise<VaultStatus> {
  try {
    const trimmedId = vaultAccountId.trim();
    if (trimmedId.length === 0) {
      throw new Error("Vault account id is required.");
    }

    const client = await getOrInitClient();
    await client.sync();

    const details = await client.accounts.getDetails(trimmedId);
    const storage = details.storage;

    const statusHex = readWordSlot(storage, [
      "status",
      "vault_status",
      "state",
    ]);
    const lastCheckinHex = readWordSlot(storage, [
      "last_checkin",
      "lastCheckin",
      "last_check_in",
    ]);
    const deadlineHex = readWordSlot(storage, ["deadline", "deadline_block"]);
    const canReleaseHex = readWordSlot(storage, [
      "can_release",
      "canRelease",
      "releasable",
    ]);

    return {
      status: statusHex.length > 0 ? statusHex : "unknown",
      lastCheckin: lastCheckinHex.length > 0 ? lastCheckinHex : "unknown",
      deadline: deadlineHex.length > 0 ? deadlineHex : "unknown",
      canRelease: parseFlagWord(canReleaseHex),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read vault status. ${detail}`);
  }
}

/**
 * Sends a check-in transaction from the connected wallet toward the vault account.
 */
export async function checkIn(vaultAccountId: string): Promise<string> {
  try {
    const trimmedVault = vaultAccountId.trim();
    if (trimmedVault.length === 0) {
      throw new Error("Vault account id is required.");
    }

    const ownerId = getConnectedAccountId();
    if (ownerId === null || ownerId.trim().length === 0) {
      throw new Error(
        "No connected wallet. Connect your account before sending a check-in."
      );
    }

    if (canUseMidenWalletExtension()) {
      return await createCheckinWithExtension(trimmedVault);
    }

    throw new Error(
      "Check-in is not implemented yet for the non-extension path."
    );
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Check-in is not implemented yet")
    ) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not send a check-in transaction. ${detail}`);
  }
}

/**
 * True when the network refuses to return details for a private account.
 * Expected for the deployed private vault template; not a user-facing failure.
 */
export function isPrivateAccountLookupError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    lower.includes("private") &&
    (lower.includes("cannot be retrieved") ||
      lower.includes("details cannot"))
  );
}

/**
 * Lists local accounts whose code matches the deployed vault template (excluding the template id).
 * Returns an empty list when the template is private and cannot be read from the network.
 */
export async function getUserVaults(): Promise<string[]> {
  try {
    const client = await getOrInitClient();
    await client.sync();

    const templateAccount = await client.accounts.getOrImport(
      VAULT_CONTRACT_ACCOUNT_ID
    );
    const templateCommitmentHex = templateAccount.code().commitment().toHex();
    const templateIdNorm = normalizeAccountIdHex(VAULT_CONTRACT_ACCOUNT_ID);

    const headers: AccountHeader[] = await client.accounts.list();
    const result: string[] = [];

    for (const header of headers) {
      const idNorm = normalizeAccountIdHex(header.id().toString());
      if (idNorm === templateIdNorm) {
        continue;
      }
      if (header.codeCommitment().toHex() === templateCommitmentHex) {
        result.push(header.id().toString());
      }
    }

    return result;
  } catch (err) {
    if (isPrivateAccountLookupError(err)) {
      return [];
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not list vault accounts. ${detail}`);
  }
}
