"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL } from "@/lib/format";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface HeadRequest {
  id: string;
  status: string;
  head: { id: string; name: string; email: string };
  askedBy: { name: string };
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  mine: boolean;
}

export interface CentrePeople {
  managers: Person[];
  /** Every active head of centre, to pick from. Nobody is created here. */
  candidates: Person[];
  /** Sets heads directly: super admin and head office. */
  mayAssign: boolean;
  /** Answers a franchisee's request: the super admin alone. */
  mayDecide: boolean;
  /** Asks for one: a franchisee, at a centre they run. */
  mayRequest: boolean;
  /** Requests this viewer can see — their own, or all of them for an admin. */
  requests: HeadRequest[];
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-900 ring-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-700 ring-red-200",
  WITHDRAWN: "bg-slate-50 text-slate-600 ring-slate-200",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  WITHDRAWN: "Withdrawn",
};

/**
 * Who runs this centre, and — for the people allowed to have a say — changing
 * it.
 *
 * Two different controls, because there are two different authorities. A super
 * admin or head office picks the heads and it takes effect. A franchisee asks
 * for one and nothing happens until that is approved; they see the request
 * sitting there with its status, so "I did that last week" is answerable
 * without asking anybody. Everyone else sees the list and no controls, because
 * knowing who receives a centre's reports is useful to anybody who can read the
 * centre at all.
 */
export function CentreHeads({
  centreId,
  centreName,
  people,
}: {
  centreId: string;
  centreName: string;
  people: CentrePeople;
}) {
  const { managers, candidates, mayAssign, mayDecide, mayRequest, requests } = people;
  const router = useRouter();
  const heads = managers.filter((m) => m.role === "CENTRE_HEAD");
  const others = managers.filter((m) => m.role !== "CENTRE_HEAD");

  const [chosen, setChosen] = useState<string[]>(heads.map((h) => h.id));
  const [asking, setAsking] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const dirty =
    chosen.length !== heads.length || chosen.some((id) => !heads.some((h) => h.id === id));

  // Someone already at the centre, or already asked for, is not a candidate.
  const pendingIds = new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.head.id));
  const askable = candidates.filter((c) => !managers.some((m) => m.id === c.id) && !pendingIds.has(c.id));

  async function send(url: string, init: RequestInit, done: (body: { managers?: Person[] }) => string) {
    setBusy(true);
    setNotice("");
    setError("");
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save.");
      return;
    }
    setNotice(done(body));
    router.refresh();
  }

  const save = () =>
    send(
      `/api/centres/${centreId}/heads`,
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ headIds: chosen }) },
      (body) =>
        chosen.length
          ? `${centreName}'s reports now go to ${(body.managers ?? []).map((m: Person) => m.name).join(", ")}.`
          : `Nobody is set as head of ${centreName}.`
    );

  const ask = () => {
    const who = candidates.find((c) => c.id === asking);
    return send(
      `/api/centres/${centreId}/head-requests`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headId: asking, note: note.trim() || undefined }),
      },
      () => {
        setAsking("");
        setNote("");
        return `Your request for ${who?.name ?? "them"} has been sent. A super admin will approve it before anything changes.`;
      }
    );
  };

  const withdraw = (r: HeadRequest) =>
    send(`/api/head-requests/${r.id}`, { method: "DELETE" }, () => `Your request for ${r.head.name} has been withdrawn.`);

  const decide = (r: HeadRequest, decision: "APPROVED" | "REJECTED") =>
    send(
      `/api/head-requests/${r.id}/decide`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      },
      () =>
        decision === "APPROVED"
          ? `${r.head.name} is now a head of ${centreName} and will receive its reports.`
          : `The request for ${r.head.name} was not approved. Nothing has changed.`
    );

  const visible = requests.filter((r) => r.status === "PENDING" || r.mine);

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-navy">Who runs this centre</h2>
      <p className="text-sm text-slate-500">
        Everyone here receives its inspection reports and can read its history.
      </p>

      {managers.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Nobody receives this centre&apos;s reports.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {[...others, ...heads].map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-2 p-3 text-sm">
              <span className="font-medium text-slate-800">{m.name}</span>
              <span className="text-slate-500">{m.email}</span>
              <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
            </li>
          ))}
        </ul>
      )}

      {visible.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">Requests</h3>
          <ul className="mt-2 space-y-2">
            {visible.map((r) => (
              <li key={r.id} className={`rounded-lg px-3 py-2 text-sm ring-1 ${STATUS_TONE[r.status] ?? STATUS_TONE.WITHDRAWN}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{r.head.name}</span>
                  <span className="text-xs opacity-80">{r.head.email}</span>
                  <span className="ml-auto text-xs font-medium">{STATUS_LABEL[r.status] ?? r.status}</span>
                </div>
                <p className="mt-0.5 text-xs opacity-80">
                  Asked by {r.askedBy.name} on {new Date(r.createdAt).toLocaleDateString("en-GB")}
                  {r.note && ` — “${r.note}”`}
                </p>
                {r.decisionNote && <p className="mt-0.5 text-xs opacity-80">Reply: “{r.decisionNote}”</p>}

                {r.status === "PENDING" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mayDecide && (
                      <>
                        <button
                          onClick={() => decide(r, "APPROVED")}
                          disabled={busy}
                          className="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => decide(r, "REJECTED")}
                          disabled={busy}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {r.mine && (
                      <button
                        onClick={() => withdraw(r)}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mayAssign && (
        <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">Heads of centre</h3>
          <p className="text-xs text-slate-500">
            Pick from people who already have a head of centre account. Nobody is created here, and no other role can
            be assigned — {others.length > 0 ? "everyone else above stays as they are." : "this only changes heads of centre."}
          </p>

          {candidates.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              There are no head of centre accounts yet. A super admin creates them under People.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidates.map((c) => {
                const on = chosen.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChosen((v) => (on ? v.filter((x) => x !== c.id) : [...v, c.id]))}
                    title={c.email}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      on ? "border-navy bg-navy text-white" : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={save}
            disabled={busy || !dirty}
            className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {mayRequest && (
        <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">Ask for a head of centre</h3>
          <p className="text-xs text-slate-500">
            Pick somebody who already has a head of centre account. A super admin approves it before they get access —
            nothing changes here until they do. You stay on the centre and keep receiving its reports either way.
          </p>

          {askable.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              {candidates.length === 0
                ? "There are no head of centre accounts yet. Ask a super admin to create one."
                : "Everyone with a head of centre account is already here or already asked for."}
            </p>
          ) : (
            <>
              <select
                value={asking}
                onChange={(e) => setAsking(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Choose somebody…</option>
                {askable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.email}
                  </option>
                ))}
              </select>

              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Why (optional) — the admin approving this sees it"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <button
                onClick={ask}
                disabled={busy || !asking}
                className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send request"}
              </button>
            </>
          )}
        </div>
      )}

      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
