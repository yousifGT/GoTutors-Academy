"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar, EmptyState } from "@/components/page-ui";
import { ProgressBar } from "@/components/progress-bar";
import { CourseEnrolleesModal, CourseEnrollee } from "@/components/course-enrollees-modal";
import { UserOverviewModal } from "@/components/user-overview-modal";

export type CourseReport = {
  id: string;
  title: string;
  enrolled: number;
  completed: number;
  avgPercent: number;
  enrollees: CourseEnrollee[];
};

export type TraineeReport = {
  id: string;
  name: string;
  email: string;
  isTrained: boolean;
  enrolled: number;
  completedCourses: number;
  avgPercent: number;
  passes: number;
  fails: number;
};

export function CentreReportBoard({ courses, trainees }: { courses: CourseReport[]; trainees: TraineeReport[] }) {
  const [tab, setTab] = useState<"courses" | "trainees">("courses");
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const openCourse = courses.find((c) => c.id === openCourseId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("courses")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "courses" ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
        >
          By course ({courses.length})
        </button>
        <button
          onClick={() => setTab("trainees")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "trainees" ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
        >
          By trainee ({trainees.length})
        </button>
      </div>

      {tab === "courses" && (
        courses.length === 0 ? (
          <EmptyState icon="📊" title="No enrolment data" hint="Numbers appear here once trainees are enrolled in courses." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => {
              const completionRate = c.enrolled ? Math.round((c.completed / c.enrolled) * 100) : 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpenCourseId(c.id)}
                  className="gt-card group flex flex-col p-5 text-left transition hover:border-picton/50"
                  title="See everyone enrolled and their progress"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-picton/15 text-xl text-picton">📚</div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold tracking-tight ${completionRate >= 70 ? "text-mint" : completionRate >= 40 ? "text-gold" : "text-orange"}`}>{completionRate}%</div>
                      <div className="text-xs text-[var(--muted)]">completion</div>
                    </div>
                  </div>
                  <div className="mt-3 min-w-0 flex-1">
                    <div className="truncate text-lg font-bold tracking-tight transition group-hover:text-picton" title={c.title}>{c.title}</div>
                    <div className="mt-2"><ProgressBar percent={c.avgPercent} /></div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{c.avgPercent}% average lesson progress</div>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3">
                    <div className="flex gap-5">
                      <div>
                        <div className="text-xl font-bold leading-tight">{c.enrolled}</div>
                        <div className="text-xs text-[var(--muted)]">enrolled</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold leading-tight">{c.completed}</div>
                        <div className="text-xs text-[var(--muted)]">completed</div>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--muted)] opacity-0 transition group-hover:opacity-100">Who&apos;s on it →</span>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}

      {tab === "trainees" && (
        trainees.length === 0 ? (
          <EmptyState icon="👥" title="No trainees yet" hint="Trainee performance appears here once your centre has trainees." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...trainees].sort((a, b) => b.avgPercent - a.avgPercent).map((t) => (
              <div key={t.id} className="gt-card flex flex-col p-5 transition hover:border-picton/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={t.name} />
                    <div className="min-w-0">
                      <div className="truncate font-bold">{t.name}</div>
                      <div className="truncate text-xs text-[var(--muted)]">{t.email}</div>
                    </div>
                  </div>
                  {t.isTrained && <span className="gt-badge shrink-0 bg-gold/15 text-gold">🏅 Trained</span>}
                </div>
                <div className="mt-3 flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs text-[var(--muted)]">Overall progress</span>
                    <span className="font-bold">{t.avgPercent}%</span>
                  </div>
                  <div className="mt-1.5"><ProgressBar percent={t.avgPercent} /></div>
                  <div className="mt-2 flex gap-2">
                    <span className="gt-badge bg-mint/15 text-mint">✓ {t.passes} quiz pass{t.passes === 1 ? "" : "es"}</span>
                    {t.fails > 0 && <span className="gt-badge bg-orange/15 text-orange">✗ {t.fails} fail{t.fails === 1 ? "" : "s"}</span>}
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3">
                  <div className="flex gap-5">
                    <div>
                      <div className="text-xl font-bold leading-tight">{t.enrolled}</div>
                      <div className="text-xs text-[var(--muted)]">course{t.enrolled === 1 ? "" : "s"}</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold leading-tight">{t.completedCourses}</div>
                      <div className="text-xs text-[var(--muted)]">completed</div>
                    </div>
                  </div>
                  <Link href={`/centre/trainees/${t.id}`} className="gt-btn-ghost text-xs">View →</Link>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {openCourse && !openUserId && (
        <CourseEnrolleesModal
          title={openCourse.title}
          enrollees={openCourse.enrollees}
          onClose={() => setOpenCourseId(null)}
          onOpenUser={(id) => setOpenUserId(id)}
        />
      )}
      {openUserId && <UserOverviewModal userId={openUserId} onClose={() => setOpenUserId(null)} />}
    </div>
  );
}
