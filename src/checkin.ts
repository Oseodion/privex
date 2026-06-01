
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
    const { checkIn } = await import("./vault");
    const txId = await checkIn(vaultAccountId);
    dispatchCheckinEvent("checkin:complete", { txId });
    return txId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dispatchCheckinEvent("checkin:error", { message });
    throw err instanceof Error ? err : new Error(message);
  }
}

