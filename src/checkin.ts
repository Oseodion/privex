import { checkIn } from "./vault";

/** Payload for the check-in success event so listeners can read the transaction id. */
export interface CheckinCompleteDetail {
  txId: string;
}

/** Payload for the check-in failure event so listeners can show the error text. */
export interface CheckinErrorDetail {
  message: string;
}

/**
 * Fires a browser CustomEvent when running in a window; no-op elsewhere.
 */
function dispatchCheckinEvent(
  name: "checkin:start" | "checkin:complete" | "checkin:error",
  detail?: CheckinCompleteDetail | CheckinErrorDetail
): void {
  if (typeof window === "undefined") {
    return;
  }
  if (detail !== undefined) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } else {
    window.dispatchEvent(new CustomEvent(name));
  }
}

/**
 * Runs the vault check-in transaction and notifies the UI through custom DOM events.
 */
export async function sendCheckIn(vaultAccountId: string): Promise<string> {
  dispatchCheckinEvent("checkin:start");
  try {
    const txId = await checkIn(vaultAccountId);
    dispatchCheckinEvent("checkin:complete", { txId });
    return txId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dispatchCheckinEvent("checkin:error", { message });
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * Builds a short human-readable sentence from the last check-in and deadline blocks.
 */
export function formatCheckinStatus(
  lastCheckinBlock: string,
  deadlineBlock: string
): string {
  const last = lastCheckinBlock.trim().toLowerCase();
  const deadline = deadlineBlock.trim().toLowerCase();
  if (last === "unknown" || deadline === "unknown") {
    return "Check-in status not available yet.";
  }
  return `Last checked in at block ${lastCheckinBlock.trim()}. Next check-in due by block ${deadlineBlock.trim()}.`;
}

/**
 * Parses a block height string into a number, or null when it cannot be read.
 */
function parseBlockHeight(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "unknown") {
    return null;
  }
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Estimates wall-clock time left until the deadline using about one block per second.
 */
export function formatTimeRemaining(
  deadlineBlock: string,
  currentBlock: number
): string {
  if (deadlineBlock.trim().toLowerCase() === "unknown") {
    return "Not started";
  }
  const deadline = parseBlockHeight(deadlineBlock);
  if (deadline === null) {
    return "Not started";
  }
  if (!Number.isFinite(currentBlock)) {
    return "Not started";
  }
  if (currentBlock >= deadline) {
    return "Deadline passed - vault can be released";
  }
  const blocksRemaining = deadline - currentBlock;
  const secondsRemaining = blocksRemaining;
  const days = Math.floor(secondsRemaining / 86_400);
  const hours = Math.floor((secondsRemaining % 86_400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  if (days >= 1) {
    return `~${days} day${days === 1 ? "" : "s"} remaining`;
  }
  if (hours >= 1) {
    return `~${hours} hour${hours === 1 ? "" : "s"} remaining`;
  }
  if (minutes >= 1) {
    return `~${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
  }
  return "Less than a minute remaining";
}
