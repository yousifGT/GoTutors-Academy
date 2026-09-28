/** `--out dir --org id --dry-run` into an object. Unknown flags are an error, not silently ignored. */
export function parseArgs(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}"`);
    const key = arg.slice(2);
    if (!(key in allowed)) throw new Error(`Unknown option --${key}. Options: ${Object.keys(allowed).map((k) => `--${k}`).join(", ")}`);
    if (allowed[key] === "flag") out[key] = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`--${key} needs a value`);
      out[key] = value;
    }
  }
  return out;
}

/**
 * The organisation to act on: the one named, or the only one there is.
 *
 * Guessing between two centres would put one centre's children's answers in
 * another's vault, so with more than one and none named, this stops.
 */
export async function resolveOrganisation(prisma, id) {
  if (id) {
    const org = await prisma.organisation.findUnique({ where: { id } });
    if (!org) throw new Error(`No organisation with id ${id}`);
    return org;
  }
  const orgs = await prisma.organisation.findMany({ orderBy: { createdAt: "asc" }, take: 2 });
  if (orgs.length === 0) throw new Error("There is no organisation yet. Visit /setup first.");
  if (orgs.length > 1) {
    const all = await prisma.organisation.findMany({ select: { id: true, name: true } });
    throw new Error(
      `More than one centre on this database — pass --org <id>:\n${all.map((o) => `  ${o.id}  ${o.name}`).join("\n")}`
    );
  }
  return orgs[0];
}
