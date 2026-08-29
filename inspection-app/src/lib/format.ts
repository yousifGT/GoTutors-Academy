import type { CentreSize } from "@prisma/client";

export const SIZE_LABEL: Record<CentreSize, string> = {
  SMALL: "Small — up to 50 students",
  MEDIUM: "Medium — 50 to 150",
  LARGE: "Large — 150+",
};

export const SIZE_SHORT: Record<CentreSize, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  HEAD_OFFICE: "Head office",
  REGIONAL_MANAGER: "Regional manager",
  FRANCHISEE: "Franchisee",
  CENTRE_HEAD: "Head of centre",
  INSPECTOR: "Inspector",
  READ_ONLY: "Read only",
};

export function niceDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function shortDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
