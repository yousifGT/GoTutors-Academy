import { describe, it, expect } from "vitest";
import { certificateDateLabel } from "./field-view";

describe("certificateDateLabel", () => {
  it("says qualified only when the field is complete", () => {
    expect(certificateDateLabel({ trained: true, retraining: false })).toBe("Qualified");
  });

  // The case that read "Qualified 21/07/2026" next to "2/3 courses done".
  it("does not claim a part-trained field is qualified", () => {
    expect(certificateDateLabel({ trained: false, retraining: false })).toBe("Latest certificate");
  });

  it("marks a lapsed tutor's date as historical", () => {
    expect(certificateDateLabel({ trained: false, retraining: true })).toBe("Last qualified");
    // Retraining wins even if the flags disagree — the field has an unmet requirement.
    expect(certificateDateLabel({ trained: true, retraining: true })).toBe("Last qualified");
  });
});
