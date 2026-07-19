import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  coursePrerequisite: { findMany: vi.fn() },
  enrollment: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { wouldCreateCycle, getMissingPrerequisites } from "./course-prereqs";

beforeEach(() => vi.clearAllMocks());

/** Build a findMany mock over an edge list [courseId, prerequisiteId][] */
function mockEdges(edges: [string, string][]) {
  db.coursePrerequisite.findMany.mockImplementation(async ({ where }: any) => {
    const ids: string[] = where.courseId.in;
    return edges.filter(([c]) => ids.includes(c)).map(([, p]) => ({ prerequisiteId: p }));
  });
}

describe("wouldCreateCycle", () => {
  it("rejects a direct self-reference", async () => {
    mockEdges([]);
    expect(await wouldCreateCycle("A", ["A"])).toBe(true);
  });

  it("rejects a two-course cycle (A needs B while B needs A)", async () => {
    mockEdges([["B", "A"]]); // B already requires A
    expect(await wouldCreateCycle("A", ["B"])).toBe(true);
  });

  it("rejects a transitive cycle (A -> C -> B -> A)", async () => {
    mockEdges([
      ["C", "B"],
      ["B", "A"],
    ]);
    expect(await wouldCreateCycle("A", ["C"])).toBe(true);
  });

  it("accepts a legitimate chain and shared prerequisites", async () => {
    mockEdges([
      ["C", "B"],
      ["B", "D"],
    ]);
    expect(await wouldCreateCycle("A", ["C", "D"])).toBe(false);
  });

  it("terminates on diamond graphs (no infinite loop)", async () => {
    mockEdges([
      ["B", "D"],
      ["C", "D"],
      ["D", "E"],
    ]);
    expect(await wouldCreateCycle("A", ["B", "C"])).toBe(false);
  });
});

describe("getMissingPrerequisites", () => {
  it("returns [] when the course has no prerequisites", async () => {
    db.coursePrerequisite.findMany.mockResolvedValue([]);
    expect(await getMissingPrerequisites("u1", "A")).toEqual([]);
    expect(db.enrollment.findMany).not.toHaveBeenCalled();
  });

  it("returns only the prerequisites without a completed enrollment", async () => {
    db.coursePrerequisite.findMany.mockResolvedValue([
      { prerequisiteId: "B", prerequisite: { id: "B", title: "Safeguarding" } },
      { prerequisiteId: "C", prerequisite: { id: "C", title: "Classroom Basics" } },
    ]);
    db.enrollment.findMany.mockResolvedValue([{ courseId: "B" }]); // B completed
    expect(await getMissingPrerequisites("u1", "A")).toEqual([{ id: "C", title: "Classroom Basics" }]);
    expect(db.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ completed: true, userId: "u1" }) })
    );
  });
});
