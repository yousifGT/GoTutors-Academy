import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * "I have forgotten my password."
 *
 * The whole shape of this is decided by one rule: **an outsider must not be
 * able to learn whether an address has an account here**. This is a company's
 * staff list; confirming that a given person works for GoTutors is itself worth
 * something to someone phishing them. So the request endpoint answers the same
 * way, in the same time, whether or not the address is known, and nothing that
 * fails after that point is reported back either.
 *
 * The token is 32 random bytes. Only its hash is stored, so a copy of the table
 * — a backup, a leaked dump, read access for support — is not a set of working
 * links into people's accounts. It expires in an hour, is spent on first use,
 * and using it revokes every session the account already had.
 */

/** Long enough that guessing is not a strategy, short enough to survive a mail client. */
const TOKEN_BYTES = 32;
export const RESET_TTL_MIN = 60;

/** Requests a single account will accept before it stops issuing links. */
export const MAX_OPEN_RESETS = 5;

export function hashToken(token: string): string {
  // Plain SHA-256, not bcrypt. The token is 256 bits of randomness rather than
  // a human-chosen password, so there is no dictionary to slow an attacker
  // down through — and a lookup by hash has to be a single indexed read.
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function resetUrl(token: string, appUrl = process.env.NEXTAUTH_URL || ""): string {
  return `${appUrl.replace(/\/$/, "")}/reset?token=${encodeURIComponent(token)}`;
}

export type ResetLookup =
  | { ok: true; resetId: string; userId: string }
  | { ok: false; reason: "unknown" | "expired" | "used" | "inactive" };

/**
 * The account a token belongs to, if it is still good for anything.
 *
 * The reasons are for the log and for the page's wording, not for telling one
 * kind of bad token from another to whoever is holding it: every failure shows
 * the same message, because "expired" and "already used" both confirm that the
 * link was real.
 */
export async function lookupToken(token: string, now = new Date()): Promise<ResetLookup> {
  if (!token) return { ok: false, reason: "unknown" };
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { active: true } } },
  });
  if (!row) return { ok: false, reason: "unknown" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  if (!row.user.active) return { ok: false, reason: "inactive" };
  return { ok: true, resetId: row.id, userId: row.userId };
}

/**
 * Whether this account may be sent another link.
 *
 * Someone who knows an address can otherwise use this endpoint to fill that
 * person's inbox, from a real address they will not think to filter. The rate
 * limiter caps how often a request can be MADE; this caps how many live links
 * exist, which is the thing that actually reaches them.
 */
export async function tooManyOpenResets(userId: string, now = new Date()): Promise<boolean> {
  const open = await prisma.passwordReset.count({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
  });
  return open >= MAX_OPEN_RESETS;
}

export async function createReset(userId: string, from: string | null, now = new Date()) {
  const { token, tokenHash } = newToken();
  await prisma.passwordReset.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(now.getTime() + RESET_TTL_MIN * 60_000),
      requestedFrom: from,
    },
  });
  return token;
}

/**
 * Set the new password and close everything the old one could still do.
 *
 * All three writes go together or none of them do. A password changed without
 * the token being spent leaves a working link; a token spent without the
 * password changing locks someone out of their own reset; and either without
 * `sessionsValidFrom` moving leaves whoever prompted the reset still signed in.
 */
export async function completeReset(resetId: string, userId: string, passwordHash: string, now = new Date()) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash, sessionsValidFrom: now },
    }),
    prisma.passwordReset.update({ where: { id: resetId }, data: { usedAt: now } }),
    // Every other outstanding link for this account, spent as well: a second
    // one still working would undo the change that was just made.
    prisma.passwordReset.updateMany({
      where: { userId, usedAt: null, id: { not: resetId } },
      data: { usedAt: now },
    }),
  ]);
}

/** Expired and spent rows, cleared out. Nothing here is worth keeping. */
export async function pruneResets(now = new Date()): Promise<number> {
  const { count } = await prisma.passwordReset.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });
  return count;
}
