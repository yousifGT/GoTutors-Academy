import { prisma } from "@/lib/prisma";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { formatDate } from "@/lib/utils";
import { PhoneEditor } from "@/components/phone-editor";

/** Read-only "my profile" card shown from the sidebar chip, shared by every role. */
export async function ProfileCard({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { select: { name: true, type: true } },
      centre: { select: { name: true } },
      supervisor: { select: { name: true } },
    },
  });
  if (!user) return null;
  const subs = effectiveSubPositions(user);

  return (
    <div className="max-w-xl space-y-6">
      <div className="gt-card p-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-picton text-navy grid place-items-center text-xl font-bold">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-sm text-[var(--muted)]">{user.role.name}</p>
          </div>
          {user.role.type === "TRAINEE" && user.isTrained && (
            <span className="gt-badge bg-mint/20 text-mint ml-auto">Trained</span>
          )}
        </div>

        <dl className="mt-6 space-y-4">
          {user.role.type === "TRAINEE" && (
            <div>
              <dt className="gt-label">Positions</dt>
              <dd>
                {subs.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {subs.map((s) => (
                      <span key={s} className="gt-badge bg-lavender text-magenta">{s}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-[var(--muted)]">No positions assigned yet.</span>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt className="gt-label">Email</dt>
            <dd className="text-sm">{user.email}</dd>
          </div>
          <div>
            <dt className="gt-label">Phone</dt>
            <dd><PhoneEditor initial={user.phone} /></dd>
          </div>
          <div>
            <dt className="gt-label">Centre</dt>
            <dd className="text-sm">{user.centre?.name ?? "—"}</dd>
          </div>
          {user.supervisor && (
            <div>
              <dt className="gt-label">Supervisor</dt>
              <dd className="text-sm">{user.supervisor.name}</dd>
            </div>
          )}
          <div>
            <dt className="gt-label">Member since</dt>
            <dd className="text-sm">{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Something wrong with these details? Contact your centre admin — only your phone number can be changed here.
      </p>
    </div>
  );
}
