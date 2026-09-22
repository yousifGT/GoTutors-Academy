import crypto from "node:crypto";

/**
 * A temporary password for a new account: readable enough to dictate across a
 * room, random enough to be safe for the hour it exists.
 *
 * base64url, so there are no characters that get lost when someone writes it
 * on a sticky note — and always paired with `mustChangePassword`, because a
 * password two people know must not become permanent.
 */
export function generatePassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}
