/**
 * A local copy of an inspection in progress.
 *
 * The server is the record; this is only the work that has not reached it yet.
 * An inspector in a back classroom with no signal keeps answering, autosave
 * keeps failing, and everything since the last successful save lives here — so
 * closing the tab, running out of battery or a browser crash no longer costs
 * them the visit.
 *
 * Every call is wrapped: `localStorage` throws outright in some private modes
 * and when the quota is full, and losing the mirror must never take the
 * inspection down with it. A missing mirror is a return to the old behaviour,
 * not a failure.
 */

const PREFIX = "gt-inspection-draft:";
/** Old drafts are pruned so a year of visits cannot fill the quota. */
const MAX_AGE_DAYS = 14;

export interface DraftSnapshot {
  inspectionId: string;
  /** Epoch milliseconds. Compared against the server's own updatedAt. */
  savedAt: number;
  answers: { questionId: string; answer: string | null; entries: { note: string; who: string; photos: string[] }[] }[];
  debrief: { role: string; name: string; notes: string; feedback: string; email: string };
  targets: string;
  activeMs: number;
}

/** Anything with the localStorage shape. Passed in so this is testable. */
export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function draftKey(inspectionId: string): string {
  return PREFIX + inspectionId;
}

export function readDraft(store: Store | null | undefined, inspectionId: string): DraftSnapshot | null {
  if (!store) return null;
  try {
    const raw = store.getItem(draftKey(inspectionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    // Anything malformed is treated as absent: a half-written mirror must never
    // be restored over real answers.
    if (parsed?.inspectionId !== inspectionId || typeof parsed.savedAt !== "number") return null;
    if (!Array.isArray(parsed.answers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(store: Store | null | undefined, snapshot: DraftSnapshot): boolean {
  if (!store) return false;
  try {
    store.setItem(draftKey(snapshot.inspectionId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(store: Store | null | undefined, inspectionId: string): void {
  if (!store) return;
  try {
    store.removeItem(draftKey(inspectionId));
  } catch {
    /* nothing to do — the mirror is a convenience, not a record */
  }
}

/**
 * Whether the local copy holds work the server has not seen.
 *
 * Strictly newer, so a mirror written at the same moment as the save that
 * succeeded is not restored over it. When the server time is unknown we do
 * restore: unsaved work is the more likely explanation, and the inspector can
 * see what came back.
 */
export function shouldRestore(draft: DraftSnapshot | null, serverUpdatedAt: string | number | null): boolean {
  if (!draft) return false;
  if (serverUpdatedAt === null) return true;
  const server = typeof serverUpdatedAt === "number" ? serverUpdatedAt : Date.parse(serverUpdatedAt);
  if (Number.isNaN(server)) return true;
  return draft.savedAt > server;
}

/** Drop mirrors of visits long finished. Returns how many were removed. */
export function pruneDrafts(store: Store | null | undefined, now: number = Date.now()): number {
  if (!store) return 0;
  const cutoff = now - MAX_AGE_DAYS * 86_400_000;
  const stale: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = store.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as DraftSnapshot;
        if (typeof parsed?.savedAt !== "number" || parsed.savedAt < cutoff) stale.push(key);
      } catch {
        stale.push(key); // unparseable is stale by definition
      }
    }
    stale.forEach((k) => store.removeItem(k));
  } catch {
    return 0;
  }
  return stale.length;
}

/** The browser's localStorage, or null where it is unavailable. */
export function browserStore(): Store | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    // Touch it: some browsers expose the object but throw on use.
    const probe = "__gt_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}
