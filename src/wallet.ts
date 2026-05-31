import { MidenClient } from "@miden-sdk/miden-sdk";
import {
  clearConnectedAccount,
  getConnectedAccountId,
  loadSavedAccountId,
  setConnectedAccountId,
} from "./account";

export {
  clearConnectedAccount,
  getConnectedAccountId,
  loadSavedAccountId,
  setConnectedAccountId,
};

/** Holds the Miden SDK client after a successful init. */
let midenClient: MidenClient | null = null;

/** Max wait for MidenClient.createTestnet (SDK has no built-in connect timeout). */
const INIT_CLIENT_TIMEOUT_MS = 60_000;

/**
 * Rejects if promise does not settle within ms. Used to fail fast on RPC connect hangs.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after 60 seconds. Check your network and try again.`
        )
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Creates a Miden client for public testnet and keeps it in memory for later calls.
 * Safe to call again: returns the same client if already initialized.
 */
export async function initClient(): Promise<MidenClient> {
  if (midenClient !== null) {
    return midenClient;
  }
  try {
    const client = await withTimeout(
      MidenClient.createTestnet({
        proverUrl: "testnet",
        autoSync: false,
      }),
      INIT_CLIENT_TIMEOUT_MS,
      "Miden testnet client connection"
    );
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
  const accountId = getConnectedAccountId();
  return (
    midenClient !== null &&
    accountId !== null &&
    accountId.length > 0
  );
}
