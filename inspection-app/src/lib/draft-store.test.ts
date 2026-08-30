import { describe, it, expect } from "vitest";
import {
  clearDraft,
  draftKey,
  pruneDrafts,
  readDraft,
  shouldRestore,
  writeDraft,
  type DraftSnapshot,
  type Store,
} from "./draft-store";

/** Behaves like localStorage, including a length that tracks its contents. */
function fakeStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    get length() {
      return Object.keys(data).length;
    },
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
    key: (i: number) => Object.keys(data)[i] ?? null,
  } as Store & { data: Record<string, string> };
}

const snap = (over: Partial<DraftSnapshot> = {}): DraftSnapshot => ({
  inspectionId: "i1",
  savedAt: 1_000_000,
  answers: [{ questionId: "q1", answer: "no", entries: [{ note: "blocked", who: "", photos: [] }] }],
  debrief: { role: "", name: "", notes: "", feedback: "", email: "" },
  targets: "",
  activeMs: 60_000,
  ...over,
});

describe("read and write", () => {
  it("round-trips a snapshot", () => {
    const store = fakeStore();
    expect(writeDraft(store, snap())).toBe(true);
    expect(readDraft(store, "i1")).toEqual(snap());
  });

  it("returns nothing when there is nothing", () => {
    expect(readDraft(fakeStore(), "i1")).toBeNull();
  });

  it("treats a half-written or foreign mirror as absent", () => {
    // Restoring a malformed copy over real answers would be worse than losing it.
    expect(readDraft(fakeStore({ [draftKey("i1")]: "{not json" }), "i1")).toBeNull();
    expect(readDraft(fakeStore({ [draftKey("i1")]: JSON.stringify({ inspectionId: "other" }) }), "i1")).toBeNull();
    expect(
      readDraft(fakeStore({ [draftKey("i1")]: JSON.stringify({ inspectionId: "i1", savedAt: "soon" }) }), "i1")
    ).toBeNull();
    expect(
      readDraft(fakeStore({ [draftKey("i1")]: JSON.stringify({ inspectionId: "i1", savedAt: 1, answers: {} }) }), "i1")
    ).toBeNull();
  });

  it("survives a storage that throws", () => {
    const broken = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("denied"); },
      key: () => null,
      length: 0,
    } as Store;
    expect(readDraft(broken, "i1")).toBeNull();
    expect(writeDraft(broken, snap())).toBe(false);
    expect(() => clearDraft(broken, "i1")).not.toThrow();
  });

  it("does nothing when there is no storage at all", () => {
    expect(readDraft(null, "i1")).toBeNull();
    expect(writeDraft(null, snap())).toBe(false);
    expect(() => clearDraft(null, "i1")).not.toThrow();
  });

  it("clears one inspection without touching another", () => {
    const store = fakeStore();
    writeDraft(store, snap());
    writeDraft(store, snap({ inspectionId: "i2" }));
    clearDraft(store, "i1");
    expect(readDraft(store, "i1")).toBeNull();
    expect(readDraft(store, "i2")).not.toBeNull();
  });
});

describe("shouldRestore", () => {
  it("restores only work newer than the server's", () => {
    expect(shouldRestore(snap({ savedAt: 2000 }), new Date(1000).toISOString())).toBe(true);
    expect(shouldRestore(snap({ savedAt: 1000 }), new Date(2000).toISOString())).toBe(false);
  });

  it("does not restore a mirror written at the moment the save landed", () => {
    // Otherwise every clean load would replay the last save over itself.
    expect(shouldRestore(snap({ savedAt: 1000 }), new Date(1000).toISOString())).toBe(false);
  });

  it("restores when the server time is unknown or unparseable", () => {
    expect(shouldRestore(snap(), null)).toBe(true);
    expect(shouldRestore(snap(), "not a date")).toBe(true);
  });

  it("has nothing to restore without a draft", () => {
    expect(shouldRestore(null, null)).toBe(false);
  });
});

describe("pruneDrafts", () => {
  const now = 100 * 86_400_000;

  it("drops mirrors of visits long finished, keeping recent ones", () => {
    const store = fakeStore({
      [draftKey("old")]: JSON.stringify(snap({ inspectionId: "old", savedAt: now - 30 * 86_400_000 })),
      [draftKey("new")]: JSON.stringify(snap({ inspectionId: "new", savedAt: now - 86_400_000 })),
    });
    expect(pruneDrafts(store, now)).toBe(1);
    expect(readDraft(store, "old")).toBeNull();
    expect(readDraft(store, "new")).not.toBeNull();
  });

  it("drops anything unparseable", () => {
    const store = fakeStore({ [draftKey("bad")]: "{{{" });
    expect(pruneDrafts(store, now)).toBe(1);
  });

  it("leaves other applications' keys alone", () => {
    const store = fakeStore({ "someone-elses-key": "value" });
    expect(pruneDrafts(store, now)).toBe(0);
    expect(store.data["someone-elses-key"]).toBe("value");
  });
});
