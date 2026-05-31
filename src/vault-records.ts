/** Minimal vault record written to localStorage after successful creation. */
export interface VaultRecord {
  id: string;
  recipient: string;
  interval: number;
  createdAt: number;
}

function storageKey(walletAddress: string): string {
  return `privex_vaults_${walletAddress.trim().toLowerCase()}`;
}

/**
 * Appends a newly created vault to the localStorage list for the given wallet address,
 * deduplicating by vault id.
 */
export function saveVaultRecord(record: VaultRecord, walletAddress: string): void {
  if (typeof localStorage === "undefined" || walletAddress.trim().length === 0) {
    return;
  }
  const existing = loadVaultRecords(walletAddress);
  const deduped = existing.filter((v) => v.id !== record.id);
  deduped.push(record);
  localStorage.setItem(storageKey(walletAddress), JSON.stringify(deduped));
}

/**
 * Returns vault records saved for the given wallet address, or an empty list on parse error.
 */
export function loadVaultRecords(walletAddress: string): VaultRecord[] {
  if (typeof localStorage === "undefined" || walletAddress.trim().length === 0) {
    return [];
  }
  try {
    const raw = localStorage.getItem(storageKey(walletAddress));
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is VaultRecord =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as VaultRecord).id === "string" &&
        typeof (item as VaultRecord).recipient === "string" &&
        typeof (item as VaultRecord).interval === "number" &&
        typeof (item as VaultRecord).createdAt === "number"
    );
  } catch {
    return [];
  }
}
