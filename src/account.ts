/** Key used in localStorage to persist the connected Miden account ID. */
const STORAGE_KEY_ACCOUNT_ID = "privex_account_id";

/** Holds the hex account ID string when the user has a connected wallet. */
let connectedAccountId: string | null = null;

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
