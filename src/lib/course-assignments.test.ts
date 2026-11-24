import { describe, it, expect, vi } from "vitest";

const db = vi.hoisted(() => ({ role: { count: vi.fn() }, course: { count: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { assignmentRows, audienceEditRefusal } from "./course-assignments";

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

describe("audienceEditRefusal", () => {
  const instructor = { id: "i1", roleType: "INSTRUCTOR" };

  // Assigning the Super Admin role enrolled every super admin, and an
  // instructor may open the profile of anyone in their course.
  it("refuses an instructor adding an admin role", async () => {
    db.role.count.mockResolvedValue(1);
    expect(await audienceEditRefusal(instructor, { roleIds: ["super-role"] })).toMatch(/super admin/);
  });

  it("lets an instructor keep an admin role a super admin already chose", async () => {
    db.role.count.mockClear();
    expect(await audienceEditRefusal(instructor, { roleIds: ["admin-role"], existingRoleIds: ["admin-role"] })).toBeNull();
    expect(db.role.count).not.toHaveBeenCalled();
  });

  it("refuses someone else's course as a prerequisite", async () => {
    db.course.count.mockResolvedValue(1);
    expect(await audienceEditRefusal(instructor, { prerequisiteIds: ["their-course"] })).toMatch(/own courses/);
  });

  it("never refuses a super admin", async () => {
    expect(await audienceEditRefusal({ id: "sa", roleType: "SUPER_ADMIN" }, { roleIds: ["x"], prerequisiteIds: ["y"] })).toBeNull();
  });
});
