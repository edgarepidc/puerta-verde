import {
  CLEARANCE_PACK_DRAFT_KEY,
  type ClearancePackDraftItem,
} from '@puertaverde/shared';

export function readClearancePackDraft(): ClearancePackDraftItem[] {
  try {
    const raw = window.sessionStorage.getItem(CLEARANCE_PACK_DRAFT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: ClearancePackDraftItem[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Partial<ClearancePackDraftItem>;
      if (!row.branchProductId || !(Number(row.quantity) > 0)) continue;
      items.push({
        branchProductId: String(row.branchProductId),
        name: String(row.name ?? ''),
        unit: row.unit ? String(row.unit) : undefined,
        quantity: Number(row.quantity),
      });
    }
    return items;
  } catch {
    return [];
  }
}

export function writeClearancePackDraft(items: ClearancePackDraftItem[]) {
  window.sessionStorage.setItem(CLEARANCE_PACK_DRAFT_KEY, JSON.stringify(items));
}

export function consumeClearancePackDraft(): ClearancePackDraftItem[] {
  const items = readClearancePackDraft();
  window.sessionStorage.removeItem(CLEARANCE_PACK_DRAFT_KEY);
  return items;
}
