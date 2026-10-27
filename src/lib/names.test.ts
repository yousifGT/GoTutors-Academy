import { describe, it, expect } from "vitest";
import { duplicateOf, nameKey, sameName } from "./names";

const centres = [
  { id: "c1", name: "London Centre" },
  { id: "c2", name: "Manchester" },
];

describe("sameName", () => {
  it("ignores case, surrounding spaces and repeated spaces", () => {
    expect(sameName("London Centre", "london centre")).toBe(true);
    expect(sameName("London Centre", "  London   Centre ")).toBe(true);
    expect(nameKey(" Head  of\tCentre ")).toBe("head of centre");
  });

  it("still tells different names apart", () => {
    expect(sameName("London Centre", "London Centre 2")).toBe(false);
    expect(sameName("Hackney", "Homerton")).toBe(false);
  });
});

describe("duplicateOf", () => {
  // The bug: "Add Centre" accepted a name that already existed.
  it("finds the existing record a new name duplicates", () => {
    expect(duplicateOf("london centre", centres)?.id).toBe("c1");
    expect(duplicateOf("Leeds", centres)).toBeNull();
  });

  it("lets a record be renamed to a new spelling of its own name", () => {
    expect(duplicateOf("LONDON CENTRE", centres, "c1")).toBeNull();
  });

  it("refuses renaming one record onto another's name", () => {
    expect(duplicateOf("manchester", centres, "c1")?.id).toBe("c2");
  });
});
