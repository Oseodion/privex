import type {
  AccountHeader,
  AccountStorage,
  MidenClient,
} from "@miden-sdk/miden-sdk";
import {
  AccountComponent,
  AccountId,
  AccountType,
  AdviceMap,
  AuthSecretKey,
  Felt,
  FeltArray,
  Package,
  StorageMap,
  StorageSlot,
  StorageSlotArray,
  TransactionRequestBuilder,
  TransactionScript,
  TransactionRequest,
  TransactionProver,
  Word,
} from "@miden-sdk/miden-sdk";
import { getClient, getConnectedAccountId, initClient } from "./wallet";

/**
 * Deployed Privex vault template account on Miden testnet.
 * New user vaults should share this account's code commitment once creation is wired up.
 */
export const VAULT_CONTRACT_ACCOUNT_ID =
  "0x1bb25f2739ce6180529dcc939df797";

/** Path to the compiled vault account package served by Vite from the repo root. */
const VAULT_ACCOUNT_MASP_URL = "/assets/vault_account.masp";

/** Path to the init transaction script package served by Vite from the repo root. */
const VAULT_INIT_MASP_URL = "/assets/vault_init.masp";

/**
 * Advice-map key for init_vault parameters. Must match vault-init-tx/src/lib.rs
 * (Word::from([0, 0, 0, 1])).
 */
const VAULT_INIT_ADVICE_KEY = Word.newFromFelts([
  new Felt(0n),
  new Felt(0n),
  new Felt(0n),
  new Felt(1n),
]);

/** Storage slot name for the vault contract map (see rust-sdk-pitfalls P5). */
const VAULT_MAP_SLOT_NAME = "miden_vault_account::vault_contract::vault_map";

/**
 * Returns the connected Miden client, initializing testnet if the page was
 * refreshed with a saved account but initClient was not run yet.
 */
async function getOrInitClient(): Promise<MidenClient> {
  try {
    console.log("getOrInitClient: using existing client");
    return getClient();
  } catch {
    console.log("getOrInitClient: no client yet, calling initClient");
    return initClient();
  }
}

/**
 * Creates a new remote prover for each transaction submit. The SDK can fall
 * back to local proving if a prover handle is reused after WASM consumes it.
 */
function createFreshTestnetRemoteProver(): TransactionProver {
  return TransactionProver.newRemoteProver(
    "https://tx-prover.testnet.miden.io",
    300_000n
  );
}

/**
 * Submits a transaction with a fresh testnet remote prover on every call.
 */
async function submitWithFreshTestnetProver(
  client: MidenClient,
  account: Parameters<MidenClient["transactions"]["submit"]>[0],
  request: TransactionRequest
): Promise<Awaited<ReturnType<MidenClient["transactions"]["submit"]>>> {
  const remoteProver = createFreshTestnetRemoteProver();
  return client.transactions.submit(account, request, {
    waitForConfirmation: true,
    timeout: 300_000,
    prover: remoteProver,
  });
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
 * Loads a compiled Miden package (.masp) over HTTP from the app assets folder.
 */
async function fetchMaspPackage(url: string, label: string): Promise<Package> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not reach ${label} at ${url}. Is the dev server running? (${detail})`
    );
  }
  if (!response.ok) {
    throw new Error(
      `Could not load ${label} (${response.status} ${response.statusText}). ` +
        `Expected the file at ${url}. Run the vault-contract build and copy the .masp into src/assets/.`
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error(`The ${label} file at ${url} is empty. Rebuild and copy the .masp artifact.`);
  }
  return Package.deserialize(bytes);
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
 * Converts an AccountId to a Word for the vault contract (owner / recipient args).
 */
function accountIdToWord(accountId: AccountId): Word {
  try {
    return Word.fromHex(accountId.toString());
  } catch {
    return Word.newFromFelts([
      accountId.prefix(),
      accountId.suffix(),
      new Felt(0n),
      new Felt(0n),
    ]);
  }
}

/**
 * Builds the advice-map payload read by vault-init-tx: owner word, recipient word,
 * then interval in the first felt of the third word.
 */
function buildInitAdviceFelts(
  owner: Word,
  recipient: Word,
  intervalBlocks: number
): Felt[] {
  const ownerFelts = owner.toFelts();
  const recipientFelts = recipient.toFelts();
  const interval = new Felt(BigInt(Math.trunc(intervalBlocks)));
  return [
    ownerFelts[0],
    ownerFelts[1],
    ownerFelts[2],
    ownerFelts[3],
    recipientFelts[0],
    recipientFelts[1],
    recipientFelts[2],
    recipientFelts[3],
    interval,
    new Felt(0n),
    new Felt(0n),
    new Felt(0n),
  ];
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
 * Creates a new vault account derived from the template contract and initializes it on chain.
 */
export async function createVault(
  recipient: string,
  interval: number,
  amount: number
): Promise<string> {
  console.log("createVault called");
  try {
    console.log("validating inputs");
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

    const ownerIdStr = getConnectedAccountId();
    if (ownerIdStr === null || ownerIdStr.trim().length === 0) {
      throw new Error(
        "No connected wallet. Connect your account before creating a vault."
      );
    }

    console.log("calling getOrInitClient");
    const client = await getOrInitClient();
    console.log("client ready, syncing");
    await client.sync();
    console.log("synced, loading packages");

    const ownerId = parseAccountId(ownerIdStr, "Owner account");
    const recipientId = parseAccountId(trimmedRecipient, "Recipient account");
    const ownerWord = accountIdToWord(ownerId);
    const recipientWord = accountIdToWord(recipientId);

    console.log("loading vault account package");
    const vaultPkg = await fetchMaspPackage(
      VAULT_ACCOUNT_MASP_URL,
      "vault account package"
    );
    const vaultMap = new StorageMap();
    const vaultComponent = AccountComponent.fromPackage(vaultPkg, new StorageSlotArray([
      StorageSlot.map(VAULT_MAP_SLOT_NAME, vaultMap),
    ]));

    const seed = crypto.getRandomValues(new Uint8Array(32));
    const auth = AuthSecretKey.rpoFalconWithRNG(seed);
    console.log("creating vault account");
    const vaultAccount = await client.accounts.create({
      type: AccountType.RegularAccountImmutableCode,
      seed,
      auth,
      components: [vaultComponent],
      storage: "private",
    });

    console.log("building init transaction");
    const initPkg = await fetchMaspPackage(VAULT_INIT_MASP_URL, "vault init script");
    const txScript = TransactionScript.fromPackage(initPkg);

    const adviceMap = new AdviceMap();
    const initFelts = buildInitAdviceFelts(ownerWord, recipientWord, interval);
    adviceMap.insert(VAULT_INIT_ADVICE_KEY, new FeltArray(initFelts));

    // transactions.execute does not expose advice-map inputs; submit a built request instead.
    const request: TransactionRequest = new TransactionRequestBuilder()
      .withCustomScript(txScript)
      .extendAdviceMap(adviceMap)
      .build();

    const remoteProver = TransactionProver.newRemoteProver(
      "https://tx-prover.testnet.miden.io",
      300_000n
    );
    console.log("submitting transaction");
    await client.transactions.submit(vaultAccount, request, {
      waitForConfirmation: true,
      timeout: 300_000,
      prover: remoteProver,
    });

    await client.sync();

    return vaultAccount.id().toString();
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

    const client = await getOrInitClient();
    await client.sync();

    throw new Error(
      "Check-in is not implemented yet. Build the check_in transaction script, " +
        "then submit it with submitWithFreshTestnetProver(client, account, request) " +
        "so each transaction uses a fresh remote testnet prover."
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
