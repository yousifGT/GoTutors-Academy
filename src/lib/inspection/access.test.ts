import { describe, it, expect } from "vitest";
import { canEditInspection, canViewInspection, inspectionScope, type InspectionAccess } from "./access";

const access = (o: Partial<InspectionAccess> = {}): InspectionAccess => ({
  viewAll: false,
  viewCentre: false,
  conduct: false,
  manageTemplate: false,
  ...o,
});

const viewer = { id: "u1", centreId: "c1" };
const stranger = { id: "u2", centreId: "c2" };
const insp = { centreId: "c1", inspectorId: "u1" };

describe("inspectionScope", () => {
  it("view_all sees everything", () => {
    expect(inspectionScope(viewer, access({ viewAll: true }))).toEqual({});
  });

  it("view_centre sees their centre plus their own work", () => {
    expect(inspectionScope(viewer, access({ viewCentre: true }))).toEqual({
      OR: [{ centreId: "c1" }, { inspectorId: "u1" }],
    });
  });

  it("view_centre without a centre falls back to own work, never to everything", () => {
    expect(inspectionScope({ id: "u1", centreId: null }, access({ viewCentre: true }))).toEqual({
      inspectorId: "u1",
    });
  });

  it("no read grant still sees the inspections they carried out", () => {
    expect(inspectionScope(viewer, access())).toEqual({ inspectorId: "u1" });
  });
});

describe("canViewInspection", () => {
  it("lets the inspector read their own work whatever their grants", () => {
    expect(canViewInspection(viewer, access(), insp)).toBe(true);
  });

  it("lets a centre viewer read their own centre only", () => {
    expect(canViewInspection(stranger, access({ viewCentre: true }), { centreId: "c2", inspectorId: "u9" })).toBe(true);
    expect(canViewInspection(stranger, access({ viewCentre: true }), insp)).toBe(false);
  });

  it("refuses a centre viewer with no centre", () => {
    expect(canViewInspection({ id: "u9", centreId: null }, access({ viewCentre: true }), insp)).toBe(false);
  });

  it("lets view_all read anything", () => {
    expect(canViewInspection(stranger, access({ viewAll: true }), insp)).toBe(true);
  });
});

describe("canEditInspection", () => {
  const draft = { inspectorId: "u1", status: "DRAFT" };

  it("only the inspector who started it, and only while it is a draft", () => {
    expect(canEditInspection(viewer, access({ conduct: true }), draft)).toBe(true);
    expect(canEditInspection(stranger, access({ conduct: true }), draft)).toBe(false);
    expect(canEditInspection(viewer, access({ conduct: true }), { ...draft, status: "SUBMITTED" })).toBe(false);
  });

  it("a submitted inspection is a record — not even view_all may edit it", () => {
    expect(
      canEditInspection(viewer, access({ conduct: true, viewAll: true }), { inspectorId: "u1", status: "SUBMITTED" })
    ).toBe(false);
  });

  it("needs the conduct grant", () => {
    expect(canEditInspection(viewer, access({ viewAll: true }), draft)).toBe(false);
  });
});
