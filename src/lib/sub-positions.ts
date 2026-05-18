export const SUB_POSITIONS = [
  "Maths Tutor",
  "Science Tutor",
  "English Tutor",
  "11+ Tutor",
  "Supervisor",
  "Admin & Accounts",
  "Calling & Customer Service",
  "Head of Centre",
  "Support Staff",
] as const;

export type SubPosition = (typeof SUB_POSITIONS)[number];

export function isValidSubPosition(value: unknown): value is SubPosition {
  return typeof value === "string" && (SUB_POSITIONS as readonly string[]).includes(value);
}
