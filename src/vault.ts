import type {
  AccountHeader,
  AccountStorage,
  MidenClient,
} from "@miden-sdk/miden-sdk";
import { getClient, getConnectedAccountId } from "./wallet";

/**
 * Deployed Privex vault template account on Miden testnet.
 * New user vaults should share this account's code commitment once creation is wired up.
 */
export const VAULT_CONTRACT_ACCOUNT_ID =
  "0x1bb25f2739ce6180529dcc939df797";

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
 * Reads a single-word storage slot if a matching slot name exists.
 * TODO: Confirm exact slot names exported by the Privex vault contract after reviewing its MASM.
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
 * Creates a new vault account derived from the template contract and initializes it on chain.
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

    const client: MidenClient = getClient();
    await client.sync();

    // TODO: Load the compiled vault package or library that matches the deployed template.
    // TODO: Build AccountComponent instances (auth + vault code) required by accounts.create.
    // TODO: Call client.accounts.create with ContractCreateOptions (seed, auth, components).
    // TODO: Submit the init_vault transaction with owner, recipient, and interval arguments.
    // TODO: Verify argument order and types against the contract ABI in the Miden SDK and on-chain account.

    throw new Error(
      "Vault creation is not implemented yet. Wire accounts.create and the init_vault transaction to the Privex contract using the Miden SDK, then remove this error."
    );
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Vault creation is not implemented yet")
    ) {
      throw err;
    }
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

    const client: MidenClient = getClient();
    await client.sync();

    const details = await client.accounts.getDetails(trimmedId);
    const storage = details.storage;

    // TODO: Replace candidate slot name lists with the exact names from the Privex vault contract.
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

    const client: MidenClient = getClient();
    await client.sync();

    // TODO: Compile a transaction script that calls the vault account's check_in entrypoint.
    // TODO: Confirm whether the executing account should be the owner wallet or the vault itself.
    // TODO: Link the correct MASM libraries from the vault account component when calling client.compile.txScript.
    // const script = await client.compile.txScript({ code: "...", libraries: [...] });
    // const { txId } = await client.transactions.execute({
    //   account: ownerId,
    //   script,
    //   foreignAccounts: [trimmedVault],
    // });
    // return txId.toHex();

    throw new Error(
      "Check-in is not implemented yet. Compile the check_in transaction script and submit it with transactions.execute, then remove this error."
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
 * Lists local accounts whose code matches the deployed vault template (excluding the template id).
 */
export async function getUserVaults(): Promise<string[]> {
  try {
    const client: MidenClient = getClient();
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
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not list vault accounts. ${detail}`);
  }
}
