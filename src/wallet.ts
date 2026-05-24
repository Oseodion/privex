import { MidenClient } from "@miden-sdk/miden-sdk";

/** Key used in localStorage to persist the connected Miden account ID. */
const STORAGE_KEY_ACCOUNT_ID = "privex_account_id";

/** Holds the Miden SDK client after a successful init. */
let midenClient: MidenClient | null = null;

/** Holds the hex account ID string when the user has a connected wallet. */
let connectedAccountId: string | null = null;

/**
 * Creates a Miden client for public testnet and keeps it in memory for later calls.
 * Safe to call again: returns the same client if already initialized.
 */
export async function initClient(): Promise<MidenClient> {
  if (midenClient !== null) {
    return midenClient;
  }
  try {
    const client = await MidenClient.createTestnet({
      proverUrl: "testnet",
    });
    midenClient = client;
    return client;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not start the Miden testnet client. Check your network and try again. (${detail})`
    );
  }
}

/**
 * Returns the Miden client created by initClient.
 */
export function getClient(): MidenClient {
  if (midenClient === null) {
    throw new Error("Client not initialized - call initClient first");
  }
  return midenClient;
}

/**
 * True when the SDK client exists and we have a stored account ID for the session.
 */
export function isConnected(): boolean {
  return (
    midenClient !== null &&
    connectedAccountId !== null &&
    connectedAccountId.length > 0
  );
}

/**
 * Returns the connected account ID, or null if none is set.
 */
export function getConnectedAccountId(): string | null {
  return connectedAccountId;
}

/**
 * Remembers which account is active in memory and in the browser localStorage.
 */
export function setConnectedAccountId(accountId: string): void {
  connectedAccountId = accountId;
  try {
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available in this environment");
    }
    localStorage.setItem(STORAGE_KEY_ACCOUNT_ID, accountId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not save the account ID to browser storage. (${detail})`
    );
  }
}

/**
 * Clears the in-memory account id and removes it from localStorage (disconnect).
 */
export function clearConnectedAccount(): void {
  connectedAccountId = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY_ACCOUNT_ID);
  }
}

/**
 * Loads a previously saved account ID from localStorage into memory.
 */
export function loadSavedAccountId(): string | null {
  try {
    if (typeof localStorage === "undefined") {
      connectedAccountId = null;
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY_ACCOUNT_ID);
    if (raw === null) {
      connectedAccountId = null;
      return null;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      connectedAccountId = null;
      return null;
    }
    connectedAccountId = trimmed;
    return trimmed;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not read the saved account ID from browser storage. (${detail})`
    );
  }
}
