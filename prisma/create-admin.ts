/**
 * Bootstrap a fresh (production) database with exactly one real Super Admin.
 *
 * Unlike prisma/seed.ts this creates NO demo centres, courses or
 * *@gotutors.test accounts. It writes only the reference data the app cannot
 * function without — the permission catalogue, the four roles with their
 * default grants, and the trainee sub-positions — plus a single named Super
 * Admin. You then sign in as that person and build the real centres, courses
 * and users through the UI.
 *
 *   set "DATABASE_URL=postgresql://...?schema=academy&sslmode=require"
 *   npm run db:create-admin
 *
 * Credentials come from ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD when those
 * are set, otherwise it prompts. The password prompt is not echoed, so it stays
 * out of shell history and screenshots — prefer it over the env var on a shared
 * or recorded screen.
 *
 * Safe to re-run: reference data is upserted, and an existing account is left
 * untouched unless you pass --force (npm run db:create-admin -- --force).
 */
import { PrismaClient, RoleType } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as readline from "node:readline";
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../src/lib/permissions";
import { SUB_POSITIONS } from "../src/lib/sub-positions";

const prisma = new PrismaClient();

const MIN_PASSWORD = 12;

const interactive = process.stdin.isTTY === true;
let rl: readline.Interface | null = null;
let muted = false;

// Lines are queued as they arrive rather than read one question at a time.
// readline emits a "line" event for every line it has already parsed, and any
// line that no question happens to be awaiting is dropped — which stalls the
// run half way through whenever input arrives in a burst (piped input, or a
// paste into a terminal). Buffering here makes typed and piped input behave the
// same.
const pending: string[] = [];
const waiting: ((line: string) => void)[] = [];
let ended = false;

function reader(): readline.Interface {
  if (rl) return rl;
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
  // Suppressing the echo is what keeps a typed password off the screen; only a
  // real terminal echoes in the first place.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (!muted) process.stdout.write(s);
  };
  rl.on("line", (line) => {
    const next = waiting.shift();
    if (next) next(line);
    else pending.push(line);
  });
  rl.on("close", () => {
    ended = true;
    while (waiting.length) waiting.shift()!("");
  });
  return rl;
}

function ask(question: string, { hidden = false } = {}): Promise<string> {
  reader();
  process.stdout.write(question);
  const finish = (line: string) => {
    muted = false;
    if (hidden && interactive) process.stdout.write("\n");
    return line.trim();
  };

  const buffered = pending.shift();
  if (buffered !== undefined) return Promise.resolve(finish(buffered));
  if (ended) return Promise.resolve(finish(""));

  muted = hidden && interactive;
  return new Promise((resolve) => waiting.push((line) => resolve(finish(line))));
}

/**
 * Permissions, roles + their default grants, and the trainee sub-positions.
 * Idempotent, and required even when the admin account already exists: without
 * these rows there is no role to attach a user to and every permission check
 * denies.
 */
async function ensureReferenceData(): Promise<Partial<Record<RoleType, string>>> {
  for (const p of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, description: p.description },
      create: { key: p.key, label: p.label, description: p.description },
    });
  }
  const permByKey = new Map((await prisma.permission.findMany()).map((p) => [p.key, p]));

  const roleDefs: { name: string; type: RoleType; description: string }[] = [
    { name: "Super Admin", type: "SUPER_ADMIN", description: "Full system access" },
    { name: "Centre Admin", type: "CENTRE_ADMIN", description: "Manages a single centre" },
    { name: "Instructor", type: "INSTRUCTOR", description: "Creates and manages courses" },
    { name: "Trainee", type: "TRAINEE", description: "Takes courses" },
  ];

  const roles: Partial<Record<RoleType, string>> = {};
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { type: r.type, description: r.description },
      create: r,
    });
    roles[r.type] = role.id;

    if (r.type === "TRAINEE") {
      for (const name of SUB_POSITIONS) {
        await prisma.subPosition.upsert({
          where: { roleId_name: { roleId: role.id, name } },
          update: {},
          create: { roleId: role.id, name },
        });
      }
    }

    for (const key of DEFAULT_ROLE_PERMISSIONS[r.type] ?? []) {
      const perm = permByKey.get(key);
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: { allowed: true },
        create: { roleId: role.id, permissionId: perm.id, allowed: true },
      });
    }
  }
  return roles;
}

async function main() {
  const force = process.argv.includes("--force");

  const email = (process.env.ADMIN_EMAIL ?? (await ask("Super admin email: "))).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`"${email}" is not a valid email address.`);

  const name = (process.env.ADMIN_NAME ?? (await ask("Full name: "))).trim();
  if (!name) throw new Error("A name is required.");

  const roles = await ensureReferenceData();
  const superAdminRoleId = roles.SUPER_ADMIN;
  if (!superAdminRoleId) throw new Error("Super Admin role is missing after setup.");

  const existing = await prisma.user.findUnique({ where: { email }, include: { role: true } });
  if (existing && !force) {
    console.log(`\n${email} already exists (role: ${existing.role.name}). Password unchanged.`);
    console.log("Reset it from the app's profile popup, or re-run with --force to set a new one here.");
    return;
  }

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await ask(`Password (min ${MIN_PASSWORD} characters): `, { hidden: true });
    if ((await ask("Confirm password: ", { hidden: true })) !== password) throw new Error("Passwords did not match.");
  }
  if (password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, password: hashed, roleId: superAdminRoleId, active: true },
    create: { email, name, password: hashed, roleId: superAdminRoleId },
  });

  console.log(`\n${existing ? "Updated" : "Created"} super admin: ${user.email}`);
  console.log(`Accounts in this database: ${await prisma.user.count()}`);
  console.log("Sign in at /login, then add centres and users from /admin.");
}

main()
  .then(async () => {
    rl?.close();
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(`\nFailed: ${e instanceof Error ? e.message : e}`);
    rl?.close();
    await prisma.$disconnect();
    process.exit(1);
  });
