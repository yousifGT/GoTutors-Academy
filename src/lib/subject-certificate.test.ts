import { describe, it, expect } from "vitest";
import { subjectCertificate, subjectCertificateLabel, subjectCertificates } from "./subject-certificate";

function field(over: Partial<Parameters<typeof subjectCertificate>[0]> = {}) {
  return {
    name: "Maths Tutor",
    total: 2,
    done: 2,
    trained: true,
    retraining: false,
    lastCertifiedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

describe("subjectCertificate", () => {
  it("issues for a subject whose every course is certified", () => {
    const c = subjectCertificate(field());
    expect(c.status).toBe("qualified");
    expect(c.downloadable).toBe(true);
    expect(c.qualifiedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  // The case from the live data: qualified on a shared course, then a
  // Maths-specific course was published.
  it("marks a lapsed subject as retraining and refuses the download", () => {
    const c = subjectCertificate(field({ trained: false, retraining: true, done: 1 }));
    expect(c.status).toBe("retraining");
    expect(c.downloadable).toBe(false);
    // The old date stays visible — it says when they last held it.
    expect(c.qualifiedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("marks a never-finished subject as pending with no date", () => {
    const c = subjectCertificate(field({ trained: false, retraining: false, done: 1, lastCertifiedAt: null }));
    expect(c.status).toBe("pending");
    expect(c.downloadable).toBe(false);
    expect(c.qualifiedAt).toBeNull();
  });

  // A part-done subject can hold a certificate for one of its courses, so a
  // date alone must never read as qualified.
  it("does not treat a certificate for one course as a qualification", () => {
    const c = subjectCertificate(field({ trained: false, retraining: false, done: 1 }));
    expect(c.downloadable).toBe(false);
    expect(c.qualifiedAt).toBeNull();
  });

  it("never qualifies a subject with no courses set", () => {
    const c = subjectCertificate(field({ total: 0, done: 0, trained: false, lastCertifiedAt: null }));
    expect(c.status).toBe("pending");
    expect(c.downloadable).toBe(false);
  });
});

describe("subjectCertificateLabel", () => {
  it("says what is outstanding", () => {
    expect(subjectCertificateLabel(subjectCertificate(field({ trained: false, retraining: false, done: 1 }))))
      .toBe("Pending — 1/2 courses done");
    expect(subjectCertificateLabel(subjectCertificate(field({ trained: false, retraining: true, done: 1 }))))
      .toBe("Retraining — 1/2 courses done");
    expect(subjectCertificateLabel(subjectCertificate(field()))).toBe("Qualified");
  });

  it("explains an empty subject rather than showing 0/0", () => {
    expect(subjectCertificateLabel(subjectCertificate(field({ total: 0, done: 0, trained: false }))))
      .toBe("Pending — no courses set for this subject yet");
  });
});

describe("subjectCertificates", () => {
  it("keeps pending subjects in the list", () => {
    const out = subjectCertificates([
      field({ name: "English Tutor" }),
      field({ name: "Maths Tutor", trained: false, retraining: true, done: 1 }),
      field({ name: "Science Tutor" }),
    ]);
    expect(out.map((c) => `${c.field}:${c.status}`)).toEqual([
      "English Tutor:qualified",
      "Maths Tutor:retraining",
      "Science Tutor:qualified",
    ]);
    expect(out.filter((c) => c.downloadable)).toHaveLength(2);
  });
});
