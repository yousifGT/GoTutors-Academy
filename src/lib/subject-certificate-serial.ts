import crypto from "crypto";

/**
 * A stable reference for a derived subject certificate.
 *
 * Course certificates carry a random serial stored on the row. A subject
 * qualification has no row, so its reference is derived from the person and the
 * subject instead — the same PDF regenerated next year shows the same reference.
 *
 * `GT-S-` distinguishes it from a course serial (`GT-`) so the two can never be
 * mistaken for each other. It is an identifier, not a proof: with nothing stored
 * there is nothing to revoke, and no verification endpoint exists. If either is
 * ever needed, store the certificate instead of deriving it.
 *
 * Server-only — kept out of the view helpers so `crypto` never reaches a client
 * bundle.
 */
export function subjectCertificateSerial(userId: string, field: string): string {
  const digest = crypto.createHash("sha256").update(`${userId}|${field}`).digest("hex");
  return `GT-S-${digest.slice(0, 16).toUpperCase()}`;
}
