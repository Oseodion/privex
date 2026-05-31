/** localStorage key for the persisted vault list. */
const VAULT_STORAGE_KEY = "privex_vaults";

/** Minimal vault record written to localStorage after successful creation. */
export interface VaultRecord {
  id: string;
  recipient: string;
  interval: number;
  createdAt: number;
}

/**
 * Appends a newly created vault to the localStorage list, deduplicating by id.
 */
export function saveVaultRecord(record: VaultRecord): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  const existing = loadVaultRecords();
  const deduped = existing.filter((v) => v.id !== record.id);
  deduped.push(record);
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(deduped));
}

/**
 * Returns all vault records saved to localStorage, or an empty list on parse error.
 */
export function loadVaultRecords(): VaultRecord[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
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
