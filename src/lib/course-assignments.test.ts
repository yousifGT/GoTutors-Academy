import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { assignmentRows } from "./course-assignments";

const trainee = new Set(["trainee-role"]);

describe("assignmentRows", () => {
  it("stores a role with no fields selected as the whole role", () => {
    expect(assignmentRows(["trainee-role"], [], trainee)).toEqual([{ roleId: "trainee-role", subPosition: null }]);
  });

  it("narrows a trainee role to each selected field", () => {
    expect(assignmentRows(["trainee-role"], ["Maths Trainee", "English Trainee"], trainee)).toEqual([
      { roleId: "trainee-role", subPosition: "Maths Trainee" },
      { roleId: "trainee-role", subPosition: "English Trainee" },
    ]);
  });

  // The bug: picking an admin role alongside a trainee role with a field ticked
  // saved "admins training in Maths", which matches nobody.
  it("never attaches a field to a non-trainee role", () => {
    expect(assignmentRows(["trainee-role", "admin-role"], ["Maths Trainee"], trainee)).toEqual([
      { roleId: "trainee-role", subPosition: "Maths Trainee" },
      { roleId: "admin-role", subPosition: null },
    ]);
  });
});
