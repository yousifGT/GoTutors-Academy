import { describe, it, expect } from "vitest";
import { canEditScheme, canReviewSubmission, schemeScope, studentScope, submissionScope } from "./access";
import type { Viewer } from "@/lib/session";

const admin: Viewer = { id: "u-admin", name: "A", email: "a@x.test", role: "ADMIN", organisationId: "org-1" };
const marker: Viewer = { id: "u-marker", name: "M", email: "m@x.test", role: "MARKER", organisationId: "org-1" };

describe("scopes", () => {
  it("every scope is pinned to the viewer's organisation", () => {
    for (const viewer of [admin, marker]) {
      expect(JSON.stringify(studentScope(viewer))).toContain("org-1");
      expect(JSON.stringify(schemeScope(viewer))).toContain("org-1");
      expect(JSON.stringify(submissionScope(viewer))).toContain("org-1");
    }
  });

  it("an admin sees the whole centre", () => {
    expect(studentScope(admin)).toEqual({ organisationId: "org-1" });
    expect(submissionScope(admin)).toEqual({ organisationId: "org-1" });
  });

  it("a marker sees only their own students and their own uploads", () => {
    expect(studentScope(marker)).toEqual({ organisationId: "org-1", tutorId: "u-marker" });
    expect(submissionScope(marker)).toEqual({ organisationId: "org-1", uploadedById: "u-marker" });
  });

  it("a marker can use shared schemes as well as their own", () => {
    expect(schemeScope(marker)).toEqual({
      organisationId: "org-1",
      OR: [{ ownerId: "u-marker" }, { shared: true }],
    });
  });
});

describe("canReviewSubmission", () => {
  it("never crosses an organisation, even for an admin", () => {
    expect(canReviewSubmission(admin, { organisationId: "org-2", uploadedById: "someone" })).toBe(false);
  });

  it("lets an admin correct anything in their own centre", () => {
    expect(canReviewSubmission(admin, { organisationId: "org-1", uploadedById: "someone" })).toBe(true);
  });

  it("lets the person who photographed the paper always mark it by hand", () => {
    expect(canReviewSubmission(marker, { organisationId: "org-1", uploadedById: "u-marker" })).toBe(true);
  });

  it("stops a marker correcting a colleague's paper", () => {
    expect(canReviewSubmission(marker, { organisationId: "org-1", uploadedById: "someone-else" })).toBe(false);
  });
});

describe("canEditScheme", () => {
  it("never crosses an organisation", () => {
    expect(canEditScheme(admin, { organisationId: "org-2", ownerId: "u-admin" })).toBe(false);
  });

  it("lets the owner edit, and an admin edit anything in the centre", () => {
    expect(canEditScheme(marker, { organisationId: "org-1", ownerId: "u-marker" })).toBe(true);
    expect(canEditScheme(admin, { organisationId: "org-1", ownerId: "u-marker" })).toBe(true);
  });

  it("a shared scheme is readable by the centre, not writable by it", () => {
    expect(canEditScheme(marker, { organisationId: "org-1", ownerId: "someone-else" })).toBe(false);
  });
});
