import type { Role } from "@prisma/client";

/**
 * Reading the audit log back.
 *
 * Every account change, submission, report download and missed-visit mark is
 * already written. Until something reads it, an audit trail is a liability
 * rather than a control: it costs storage, tells nobody anything, and is only
 * discovered to be incomplete when someone needs it.
 */

export type AuditGroup = "people" | "checklist" | "centres" | "inspections" | "visits";

interface ActionMeta {
  group: AuditGroup;
  label: string;
  /** Worth noticing at a glance: someone was marked, removed, or let in. */
  notable?: boolean;
}

/**
 * How each recorded action reads.
 *
 * This table is not only labels: `readableActions` builds the database filter
 * from it, so an action that is written but not listed here is never fetched
 * and is invisible in the activity screen. Failing closed is the right way
 * round — a record nobody has decided the audience for should not be shown to
 * a guessed audience — but it is a quiet way to lose an audit trail, so
 * `audit-view.test.ts` asserts that every action the code emits appears here.
 * That test is the guard; this comment is only the explanation.
 */
export const ACTIONS: Record<string, ActionMeta> = {
  "user.create": { group: "people", label: "Account created", notable: true },
  "user.update": { group: "people", label: "Account changed" },
  "user.deactivate": { group: "people", label: "Account deactivated", notable: true },
  "user.delete": { group: "people", label: "Account deleted", notable: true },
  "user.password_change": { group: "people", label: "Password changed" },
  // A reset is deliberately in the same group as the rest of account
  // administration: who asked for a link, and whether one went out, is exactly
  // what someone investigating a compromised account needs to see.
  "auth.signin": { group: "people", label: "Signed in" },
  "auth.failed": { group: "people", label: "Sign-in failed", notable: true },
  "auth.blocked": { group: "people", label: "Sign-in blocked by rate limit", notable: true },
  "password.forgot": { group: "people", label: "Password reset requested" },
  "password.reset": { group: "people", label: "Password reset used", notable: true },
  // Sends real mail from the real account, so it belongs with the rest of
  // account administration rather than with the inspections it is testing.
  "email.test": { group: "people", label: "Test email sent" },

  // The checklist is the standard every inspection is measured against, so a
  // change to it is read alongside account administration rather than with the
  // inspections it scores: knowing the bar moved is what makes two inspections
  // months apart comparable at all.
  "template.update": { group: "checklist", label: "Checklist edited", notable: true },
  "template.publish": { group: "checklist", label: "New checklist version published", notable: true },

  "centre.create": { group: "centres", label: "Centre added" },
  "centre.update": { group: "centres", label: "Centre changed" },
  "centre.heads": { group: "centres", label: "Who runs a centre changed", notable: true },
  "centre.close": { group: "centres", label: "Centre closed", notable: true },
  "centre.delete": { group: "centres", label: "Centre deleted", notable: true },
  // A franchisee cannot appoint anybody; they ask, and a super admin answers.
  // Both halves are recorded, and separately from the assignment itself, so the
  // log shows who wanted the access as well as who granted it.
  "centre.head_requested": { group: "centres", label: "Head of centre requested" },
  "centre.head_request_decided": { group: "centres", label: "Head of centre request answered", notable: true },
  "centre.head_request_withdrawn": { group: "centres", label: "Head of centre request withdrawn" },

  "inspection.start": { group: "inspections", label: "Inspection started" },
  "inspection.submit": { group: "inspections", label: "Inspection submitted", notable: true },
  "inspection.discard": { group: "inspections", label: "Draft discarded", notable: true },
  "inspection.pdf": { group: "inspections", label: "Report downloaded" },
  // Sending a report is a claim someone may have to stand behind — "we told the
  // centre on the 4th" — so who sent it, to which address, and whether it
  // actually went are recorded, not just that a button was pressed.
  "report.sent": { group: "inspections", label: "Report emailed to the centre", notable: true },
  // A separate action from the one above, because it is a different thing: a
  // report leaving to an address nobody verified, at the request of a named
  // person. The address is in the metadata every time.
  "report.sent_external": { group: "inspections", label: "Report emailed to a typed address", notable: true },
  // A bulk export is a different kind of event from opening one report: it is
  // the moment a slice of the record leaves in a form nothing here controls any
  // more. Recorded with who, what and how much, and marked worth noticing.
  "export.inspections": { group: "inspections", label: "Inspections exported to CSV", notable: true },
  "export.answers": { group: "inspections", label: "Answers exported to CSV", notable: true },

  "visit.book": { group: "visits", label: "Visit booked" },
  "visit.update": { group: "visits", label: "Visit changed" },
  "visit.delete": { group: "visits", label: "Visit cancelled" },
  "visit.done": { group: "visits", label: "Visit recorded as made" },
  "visit.missed": { group: "visits", label: "Visit marked missed", notable: true },
  "visit.planned": { group: "visits", label: "Visit reopened" },
  "visit.cancelled": { group: "visits", label: "Visit cancelled" },
};

export const GROUP_LABEL: Record<AuditGroup, string> = {
  people: "People",
  checklist: "Checklist",
  centres: "Centres",
  inspections: "Inspections",
  visits: "Visits",
};

export function describe(action: string): ActionMeta {
  return ACTIONS[action] ?? { group: groupOf(action), label: action };
}

/**
 * Where an action that is not in the table above belongs.
 *
 * The fallback is `people`, the group only a super admin may read — not
 * `inspections`, which head office can. An action nobody has classified yet is
 * one nobody has decided the audience for, and the safe assumption about an
 * unclassified record of who did what is that it is account administration.
 * Defaulting the other way means adding an action and forgetting to list it
 * quietly widens who can read it.
 */
function groupOf(action: string): AuditGroup {
  const prefix = action.split(".")[0];
  if (prefix === "template") return "checklist";
  if (prefix === "centre") return "centres";
  if (prefix === "visit") return "visits";
  if (prefix === "inspection") return "inspections";
  return "people";
}

/**
 * Which groups a role may read.
 *
 * Head office oversees the operation, so they see what happened to inspections,
 * visits and centres. Account administration — who was created, deactivated, or
 * had their password changed — stays with the super admin: it is the record of
 * who holds access, and the people who hold access should not be the only ones
 * who can quietly read it. Checklist changes sit with the super admin for the
 * same reason: only that role can make one, so only that role's own log needs
 * to show it.
 */
export function visibleGroups(role: Role): AuditGroup[] {
  if (role === "SUPER_ADMIN") return ["people", "checklist", "centres", "inspections", "visits"];
  if (role === "HEAD_OFFICE") return ["centres", "inspections", "visits"];
  return [];
}

export function canReadAudit(role: Role): boolean {
  return visibleGroups(role).length > 0;
}

export function canRead(role: Role, action: string): boolean {
  return visibleGroups(role).includes(describe(action).group);
}

/** The action names a role may see, for use as a database filter. */
export function readableActions(role: Role, only?: AuditGroup): string[] {
  const groups = visibleGroups(role).filter((g) => !only || g === only);
  return Object.entries(ACTIONS)
    .filter(([, m]) => groups.includes(m.group))
    .map(([action]) => action);
}

/**
 * The interesting parts of an entry's metadata, as short label/value pairs.
 * Anything object-shaped or empty is left out — a wall of JSON is not a record
 * anyone reads.
 */
export function summarise(metadata: unknown): { key: string; value: string }[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  return Object.entries(metadata as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .map(([key, v]) => ({ key: label(key), value: String(v) }));
}

const KEY_LABELS: Record<string, string> = {
  pct: "score",
  verdict: "verdict",
  centreId: "centre",
  inspector: "inspector",
  date: "date",
  role: "role",
  active: "active",
  passwordChanged: "password changed",
  deliveredTo: "delivered to",
  reason: "reason",
  status: "status",
  size: "size",
  name: "name",
  email: "email",
  centre: "centre",
  was: "was",
  now: "now",
  version: "version",
  from: "replaces",
  sections: "sections",
  questions: "questions",
  critical: "critical items",
  added: "questions added",
  removed: "questions removed",
  edited: "questions edited",
  sectionsAdded: "sections added",
  sectionsRemoved: "sections removed",
  rows: "rows",
  to: "sent to",
  sent: "sent",
  of: "recipients",
  problem: "problem",
  filters: "covering",
  inspections: "inspections",
};

function label(key: string): string {
  return KEY_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").toLowerCase();
}
