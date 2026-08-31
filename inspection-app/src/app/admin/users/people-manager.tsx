"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { ROLE_LABEL, shortDate } from "@/lib/format";
import { ASSIGNABLE_ROLES, CENTRE_SCOPED_ROLES, MIN_PASSWORD, ROLES } from "@/lib/user-rules";

interface Person {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  centres: { id: string; name: string }[];
  assignedCentres: { id: string; name: string }[];
  _count: { inspections: number; deliveries: number; visits: number; uploads: number };
}

const ROLE_HELP: Record<string, string> = {
  SUPER_ADMIN: "Everything, including accounts.",
  HEAD_OFFICE: "Every centre. Inspects and edits the checklist.",
  REGIONAL_MANAGER: "Inspects, and reads their own centres.",
  FRANCHISEE: "Reads their own centres. Does not inspect.",
  CENTRE_HEAD: "Runs a centre. Receives its reports; never inspects.",
  INSPECTOR: "Inspects anywhere; sees their own visits.",
  READ_ONLY: "Reads every centre. Changes nothing.",
};

/** What deleting this person would take with them. */
function held(p: { _count: { inspections: number; deliveries: number; visits: number; uploads: number } }): string[] {
  const out: string[] = [];
  if (p._count.inspections) out.push(`${p._count.inspections} inspection(s)`);
  if (p._count.deliveries) out.push(`${p._count.deliveries} report delivery record(s)`);
  if (p._count.visits) out.push(`${p._count.visits} booked visit(s)`);
  if (p._count.uploads) out.push(`${p._count.uploads} uploaded photo(s)`);
  return out;
}

export function PeopleManager({
  me,
  initial,
  centres,
}: {
  me: string;
  initial: Person[];
  centres: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [people, setPeople] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    const res = await fetch("/api/users");
    if (res.ok) setPeople(await res.json());
    router.refresh();
  };

  async function remove(p: Person) {
    const warning =
      // Everything that would be taken with them, not just inspections. A
      // centre head has none of those and plenty of report deliveries, so this
      // used to promise "nothing is lost" and then hard-delete their record of
      // having been told about a finding.
      held(p).length > 0
        ? `${p.name} has ${held(p).join(", ")} on record, so the account will be deactivated rather than deleted. Continue?`
        : `Delete ${p.name}? They have carried out no inspections, so nothing is lost.`;
    if (!confirm(warning)) return;
    const res = await fetch(`/api/users/${p.id}`, { method: "DELETE" });
    const body = await res.json();
    setNotice(res.ok ? (body.message ?? `${p.name} removed.`) : body.error);
    if (res.ok) refresh();
  }

  return (
    <main className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">People</h1>
          <p className="text-sm text-slate-500">Who can sign in, and what they may do.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
          className="rounded-lg bg-navy px-4 py-2.5 font-semibold text-white hover:bg-navy-700"
        >
          Add person
        </button>
      </div>

      {notice && (
        <p className="mt-4 rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-900 ring-1 ring-sky-200">{notice}</p>
      )}

      {(adding || editing) && (
        <PersonForm
          person={editing}
          centres={centres}
          onDone={() => {
            setAdding(false);
            setEditing(null);
            refresh();
          }}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800">
                {p.name}
                {p.id === me && <span className="ml-2 text-xs font-normal text-slate-400">you</span>}
                {!p.active && (
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    INACTIVE
                  </span>
                )}
              </p>
              <p className="truncate text-sm text-slate-500">{p.email}</p>
              <p className="text-xs text-slate-400">
                {ROLE_LABEL[p.role]}
                {p.centres.length > 0 && ` · responsible for ${p.centres.map((c) => c.name).join(", ")}`}
                {p.assignedCentres.length > 0 && ` · assigned ${p.assignedCentres.map((c) => c.name).join(", ")}`}
                {` · ${p._count.inspections} inspection${p._count.inspections === 1 ? "" : "s"}`}
                {p.lastLoginAt ? ` · last in ${shortDate(p.lastLoginAt)}` : " · never signed in"}
              </p>
            </div>
            <button
              onClick={() => {
                setAdding(false);
                setEditing(p);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              Edit
            </button>
            {p.id !== me && (
              <button onClick={() => remove(p)} className="text-sm text-red-700 underline">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

function PersonForm({
  person,
  centres,
  onDone,
  onCancel,
}: {
  person: Person | null;
  centres: { id: string; name: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState(person?.email ?? "");
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState<Role>(person?.role ?? "INSPECTOR");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(person?.active ?? true);
  const [centreIds, setCentreIds] = useState<string[]>(person?.centres.map((c) => c.id) ?? []);
  const [assignedIds, setAssignedIds] = useState<string[]>(person?.assignedCentres.map((c) => c.id) ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const scoped = CENTRE_SCOPED_ROLES.includes(role);
  const assignable = ASSIGNABLE_ROLES.includes(role);

  async function save() {
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = {
      name,
      role,
      centreIds: scoped ? centreIds : [],
      assignedCentreIds: assignable ? assignedIds : [],
    };
    if (password) body.password = password;
    if (person) body.active = active;
    else {
      body.email = email;
      body.password = password;
    }

    const res = await fetch(person ? `/api/users/${person.id}` : "/api/users", {
      method: person ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Could not save.");
      return;
    }
    onDone();
  }

  return (
    <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="font-semibold text-navy">{person ? `Edit ${person.name}` : "Add a person"}</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            value={email}
            disabled={!!person}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky disabled:bg-slate-100 disabled:text-slate-500"
          />
          {person && <span className="text-xs font-normal text-slate-400">Sign-in address cannot be changed.</span>}
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-700">Role</legend>
        <div className="mt-1 space-y-1.5">
          {ROLES.map((r) => (
            <label key={r} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="role"
                checked={role === r}
                onChange={() => setRole(r)}
                className="mt-1 accent-sky-600"
              />
              <span>
                <span className="font-medium">{ROLE_LABEL[r]}</span>{" "}
                <span className="text-slate-500">— {ROLE_HELP[r]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {assignable && (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-700">Centres they are expected to visit</legend>
          <p className="text-xs text-slate-500">
            Shown on their home screen. It does not stop them inspecting anywhere else — an inspector can always
            be sent where they are needed.
          </p>
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {centres.map((c) => {
              const on = assignedIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setAssignedIds((v) => (on ? v.filter((x) => x !== c.id) : [...v, c.id]))}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {scoped && (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-700">Centres they are responsible for</legend>
          <p className="text-xs text-slate-500">
            They read these centres&apos; inspections and receive a report whenever one is submitted. With none
            selected they see nothing but their own work.
          </p>
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {centres.map((c) => {
              const on = centreIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCentreIds((v) => (on ? v.filter((x) => x !== c.id) : [...v, c.id]))}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    on ? "border-navy bg-navy text-white" : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <label className="mt-4 block text-sm font-medium text-slate-700">
        {person ? "Set a new password (leave blank to keep the current one)" : "Initial password"}
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`at least ${MIN_PASSWORD} characters`}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
        />
        <span className="text-xs font-normal text-slate-400">
          You will know this password — tell them to change it under their own profile once they are in.
        </span>
      </label>

      {person && (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-sky-600" />
          Account is active
        </label>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button
          onClick={save}
          disabled={busy || !name || (!person && (!email || !password))}
          className="rounded-lg bg-navy px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : person ? "Save changes" : "Create account"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2.5">
          Cancel
        </button>
      </div>
    </section>
  );
}
