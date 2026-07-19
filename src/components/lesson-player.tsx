"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SERVER_WATCH_FRACTION } from "@/lib/watch-progress";
import { timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/page-ui";

type AttemptRow = { id: string; score: number; passed: boolean; createdAt: Date | string; locked: boolean; needsReview?: boolean };
type SafeAnswer = { id: string; text: string };
type SafeQuestion = { id: string; type: "MULTIPLE_CHOICE" | "OPEN_ENDED"; prompt: string; points: number; answers: SafeAnswer[] };
type SafeQuiz = { id: string; passThreshold: number; retryLimit: number; questions: SafeQuestion[] };

export function LessonPlayer({
  courseId,
  lessonId,
  title,
  content,
  video,
  quiz,
  initialProgress,
  attempts,
  locked,
  nextLessonId,
}: {
  courseId: string;
  lessonId: string;
  title: string;
  content: string;
  video: { provider: string; url: string } | null;
  quiz: SafeQuiz | null;
  initialProgress: { videoWatched: boolean; quizPassed: boolean };
  attempts: AttemptRow[];
  locked: boolean;
  nextLessonId: string | null;
}) {
  const router = useRouter();
  const [videoWatched, setVideoWatched] = useState(initialProgress.videoWatched);
  const [quizPassed, setQuizPassed] = useState(initialProgress.quizPassed);
  const [latestAttempts, setLatestAttempts] = useState(attempts);
  const [latestLocked, setLatestLocked] = useState(locked);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [answersState, setAnswersState] = useState<Record<string, string>>({});
  const [retryMode, setRetryMode] = useState(false);

  // Reported playback position + duration; the server bounds these by real time.
  const watchedRef = useRef(0);
  const durationRef = useRef(0);

  // Reflect the video-watched flag whenever the server (via a refreshed page)
  // says it's watched — covers reloads and any router.refresh elsewhere.
  useEffect(() => {
    if (initialProgress.videoWatched) setVideoWatched(true);
  }, [initialProgress.videoWatched]);

  const pendingReview = latestAttempts.some((a) => a.needsReview);
  const usedCounted = latestAttempts.filter((a) => !a.needsReview).length;
  const remaining = quiz ? Math.max(0, quiz.retryLimit - usedCounted) : 0;
  const lastAttempt = latestAttempts[0];

  function reportPlayback(watchedSeconds: number, duration: number) {
    if (watchedSeconds > watchedRef.current) watchedRef.current = watchedSeconds;
    if (duration > 0) durationRef.current = duration;
  }

  async function postProgress(claimWatched = false) {
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId,
          watchedSeconds: Math.round(watchedRef.current),
          duration: Math.round(durationRef.current),
          ...(claimWatched ? { videoWatched: true } : {}),
        }),
        keepalive: true,
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      // The server is authoritative; reflect its decision immediately. The quiz
      // is already in props, so revealing it needs no page refresh (which would
      // otherwise churn the video player).
      if (data?.videoWatched) setVideoWatched(true);
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    let visible = !document.hidden;
    const onVis = () => { visible = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => { if (visible) postProgress(); }, 10_000);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  async function submitQuiz() {
    if (!quiz) return;
    setSubmitting(true);
    setFeedback(null);
    const res = await fetch(`/api/quiz/${quiz.id}/attempt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: answersState }),
    });
    const data = await res.json();
    setSubmitting(false);
    setRetryMode(false);
    if (!res.ok) {
      setFeedback(data.error ?? "Could not submit quiz.");
      return;
    }
    setLatestAttempts((a) => [{ id: data.attemptId, score: data.score, passed: data.passed, createdAt: new Date(), locked: data.locked, needsReview: data.needsReview }, ...a]);
    setAnswersState({});
    if (data.needsReview) {
      setFeedback("Submitted. Your answers are awaiting instructor review.");
    } else if (data.passed) {
      setQuizPassed(true);
      setFeedback(`Passed! Score: ${data.score}%`);
    } else if (data.locked) {
      setLatestLocked(true);
      setFeedback(`Failed: ${data.score}%. You have used all attempts. A centre admin has been notified.`);
    } else {
      setFeedback(`Failed: ${data.score}%. Threshold ${quiz.passThreshold}%.`);
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader backHref={`/trainee/courses/${courseId}`} backLabel="Back to course" title={title} />

      <div className="gt-card p-6">
        {content && <p className="text-[var(--muted)] whitespace-pre-line">{content}</p>}

        {video && (
          <div className="mt-5">
            <VideoEmbed
              provider={video.provider}
              url={video.url}
              done={videoWatched}
              onReport={reportPlayback}
              onReachedEnd={() => postProgress()}
              onManualComplete={() => postProgress(true)}
            />
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">{videoWatched ? "Video complete." : "Watch the full video to unlock the quiz."}</span>
            </div>
          </div>
        )}
      </div>

      {quiz && (
        <div className="gt-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold">Quiz</h3>
            <div className="text-sm text-[var(--muted)]">
              Pass threshold {quiz.passThreshold}% · attempts used <b>{usedCounted}</b>/{quiz.retryLimit} · remaining <b>{remaining}</b>
            </div>
          </div>

          {!videoWatched && (
            <div className="mt-4 rounded-xl border border-orange/30 bg-orange/10 p-4 text-orange">🔒 Quiz locked — finish the video first.</div>
          )}

          {videoWatched && (
            quizPassed ? (
              <div className="mt-4 rounded-xl bg-mint/10 border border-mint/30 p-4 text-mint">
                You have passed this quiz.
                {nextLessonId && (
                  <Link href={`/trainee/courses/${courseId}/lessons/${nextLessonId}`} className="gt-btn-accent ml-3">Next lesson</Link>
                )}
              </div>
            ) : latestLocked ? (
              <div className="mt-4 rounded-xl bg-orange/10 border border-orange/30 p-4 text-orange">
                Locked after {quiz.retryLimit} failed attempts. A centre admin has been notified to unlock retries.
              </div>
            ) : pendingReview ? (
              <div className="mt-4 rounded-xl bg-gold/10 border border-gold/30 p-4 text-gold">
                Your answers have been submitted and are awaiting instructor review. Check back once they have been graded — you can&apos;t retake this quiz until then.
              </div>
            ) : usedCounted > 0 && !retryMode ? (
              <div className="mt-4 rounded-xl border border-[var(--border)] p-4">
                <p className="text-sm">
                  Your last attempt didn&apos;t pass{lastAttempt && !lastAttempt.needsReview ? ` (${lastAttempt.score}%)` : ""}. You have <b>{remaining}</b> attempt{remaining === 1 ? "" : "s"} remaining.
                </p>
                {remaining > 0 && (
                  <button onClick={() => { setRetryMode(true); setFeedback(null); setAnswersState({}); }} className="gt-btn-primary mt-3">
                    Attempt again
                  </button>
                )}
                {feedback && <p className="text-sm mt-2">{feedback}</p>}
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {quiz.questions.map((q, i) => (
                  <div key={q.id} className="rounded-xl border border-[var(--border)] p-4">
                    <div className="font-medium">Q{i + 1}. {q.prompt}</div>
                    {q.type === "MULTIPLE_CHOICE" ? (
                      <div className="mt-3 space-y-2">
                        {q.answers.map((a) => (
                          <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={q.id}
                              value={a.id}
                              checked={answersState[q.id] === a.id}
                              onChange={() => setAnswersState((s) => ({ ...s, [q.id]: a.id }))}
                            />
                            <span>{a.text}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        className="gt-input mt-3 min-h-[100px]"
                        value={answersState[q.id] ?? ""}
                        onChange={(e) => setAnswersState((s) => ({ ...s, [q.id]: e.target.value }))}
                        placeholder="Your answer…"
                      />
                    )}
                  </div>
                ))}
                <button onClick={submitQuiz} disabled={submitting} className="gt-btn-primary">
                  {submitting ? "Submitting…" : "Submit quiz"}
                </button>
                {feedback && <p className="text-sm mt-2">{feedback}</p>}
              </div>
            )
          )}

          {latestAttempts.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-[var(--muted)]">Attempt history</summary>
              <ul className="mt-2 text-sm space-y-1">
                {latestAttempts.map((a) => (
                  <li key={a.id}>
                    {a.needsReview ? (
                      <span className="gt-badge bg-gold/15 text-gold">Pending review</span>
                    ) : (
                      <span className={`gt-badge ${a.passed ? "bg-mint/15 text-mint" : "bg-orange/15 text-orange"}`}>
                        {a.passed ? "Passed" : "Failed"}
                      </span>
                    )}
                    {" "}· {a.needsReview ? "—" : `${a.score}%`} · {timeAgo(a.createdAt)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

type PlayerProps = {
  url: string;
  done: boolean;
  onReport: (watchedSeconds: number, duration: number) => void;
  onReachedEnd: () => void;
};

function VideoEmbed({
  provider,
  url,
  done,
  onReport,
  onReachedEnd,
  onManualComplete,
}: PlayerProps & { provider: string; onManualComplete: () => void }) {
  if (provider === "UPLOAD") return <UploadedVideo url={url} done={done} onReport={onReport} onReachedEnd={onReachedEnd} />;
  if (provider === "YOUTUBE") return <YouTubeEmbed url={url} done={done} onReport={onReport} onReachedEnd={onReachedEnd} />;
  if (provider === "VIMEO") return <VimeoEmbed url={url} done={done} onReport={onReport} onReachedEnd={onReachedEnd} />;
  return <LoomEmbed url={url} done={done} onManualComplete={onManualComplete} />;
}

// Forward-jump tolerance (seconds) before it's treated as skipping. This must be
// comfortably larger than how far the video advances between samples at the
// fastest supported speed — YouTube is polled once/second, so at 2x it advances
// ~2s per sample; a too-tight tolerance would snap 2x playback back every second
// and the video could never progress. The server's 2x-of-real-time cap
// (computeWatchState) is the authoritative anti-skip guard; this is just the
// client-side snap-back for genuine large jumps.
const SEEK_TOLERANCE = 6;

/**
 * Notice shown when a skip is snapped back or an end-jump is resumed. Without
 * it, a trainee who scrubs to the end sees a "finished" video, a stuck
 * progress bar, and no explanation of why the quiz stays locked.
 */
function useSkipNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  function show() {
    setNotice("Skipping ahead doesn't count — resumed from your furthest watched point.");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 8000);
  }
  return { notice, show };
}

function UploadedVideo({ url, done, onReport, onReachedEnd }: PlayerProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const maxWatched = useRef(0);
  const reached = useRef(false);
  const [progressPct, setProgressPct] = useState(0);
  const { notice, show } = useSkipNotice();

  function clampSeek() {
    const v = ref.current;
    if (!v || done) return false;
    if (v.currentTime > maxWatched.current + SEEK_TOLERANCE) {
      v.currentTime = maxWatched.current;
      show();
      return true;
    }
    return false;
  }
  function handleTimeUpdate() {
    const v = ref.current;
    if (!v) return;
    if (clampSeek()) return;
    maxWatched.current = Math.max(maxWatched.current, v.currentTime);
    onReport(maxWatched.current, v.duration || 0);
    const pct = (maxWatched.current / Math.max(1, v.duration)) * 100;
    setProgressPct(pct);
    if (pct >= 95 && !reached.current) { reached.current = true; onReachedEnd(); }
  }
  function handleEnded() {
    const v = ref.current;
    // A jump to the end without enough genuine watching would strand the
    // player at the final frame — resume from the furthest watched point.
    if (v && !done && v.duration > 0 && maxWatched.current < v.duration * SERVER_WATCH_FRACTION) {
      v.currentTime = maxWatched.current;
      v.play().catch(() => {});
      show();
      return;
    }
    onReachedEnd();
  }
  return (
    <div>
      <video
        ref={ref}
        src={url}
        controls
        controlsList="nodownload"
        onSeeking={clampSeek}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        className="w-full rounded-xl bg-black aspect-video"
      />
      <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--soft)] overflow-hidden">
        <div className="h-full bg-picton" style={{ width: `${progressPct}%` }} />
      </div>
      {notice && <p className="mt-1 text-xs text-orange">{notice}</p>}
    </div>
  );
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function YouTubeEmbed({ url, done, onReport, onReachedEnd }: PlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const maxWatched = useRef(0);
  const reached = useRef(false);
  const [pct, setPct] = useState(0);
  const { notice, show } = useSkipNotice();
  const showRef = useRef(show); showRef.current = show;
  const id = useMemo(() => url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1], [url]);
  // Hold latest props in refs so the player initializes once per video and isn't
  // torn down/recreated when a callback identity or `done` changes.
  const doneRef = useRef(done); doneRef.current = done;
  const reportRef = useRef(onReport); reportRef.current = onReport;
  const reachedEndRef = useRef(onReachedEnd); reachedEndRef.current = onReachedEnd;

  useEffect(() => {
    if (!id || !containerRef.current) return;
    let cancelled = false;
    let pollHandle: number | null = null;

    function init() {
      if (cancelled || !window.YT || !containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: id,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            pollHandle = window.setInterval(() => {
              const p = playerRef.current;
              if (!p?.getDuration || !p?.getCurrentTime) return;
              const dur = p.getDuration();
              const cur = p.getCurrentTime();
              if (dur <= 0) return;
              if (!doneRef.current && cur > maxWatched.current + SEEK_TOLERANCE) {
                p.seekTo(maxWatched.current, true);
                // A seek from the ENDED state doesn't restart playback by
                // itself — the player would sit stranded on the end frame.
                if (p.getPlayerState?.() === 0) p.playVideo?.();
                showRef.current();
                return;
              }
              maxWatched.current = Math.max(maxWatched.current, cur);
              reportRef.current(maxWatched.current, dur);
              const next = (maxWatched.current / dur) * 100;
              setPct(next);
              if (next >= 95 && !reached.current) { reached.current = true; reachedEndRef.current(); }
            }, 1000);
          },
          onStateChange: (e: any) => {
            if (e.data !== 0) return; // 0 = ENDED
            const p = playerRef.current;
            const dur = p?.getDuration?.() ?? 0;
            // Ended without enough genuine watching (scrubbed to the end):
            // resume from the furthest watched point instead of stranding.
            if (!doneRef.current && dur > 0 && maxWatched.current < dur * SERVER_WATCH_FRACTION) {
              p.seekTo(maxWatched.current, true);
              p.playVideo?.();
              showRef.current();
              return;
            }
            reachedEndRef.current();
          },
        },
      });
    }

    if (window.YT?.Player) init();
    else {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); init(); };
      document.head.appendChild(tag);
    }

    return () => {
      cancelled = true;
      if (pollHandle) clearInterval(pollHandle);
      try { playerRef.current?.destroy?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) return <iframe src={url} className="aspect-video w-full rounded-xl bg-black" />;
  return (
    <div>
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--soft)] overflow-hidden">
        <div className="h-full bg-picton" style={{ width: `${pct}%` }} />
      </div>
      {notice && <p className="mt-1 text-xs text-orange">{notice}</p>}
    </div>
  );
}

function VimeoEmbed({ url, done, onReport, onReachedEnd }: PlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const maxWatched = useRef(0);
  const durRef = useRef(0);
  const reached = useRef(false);
  const [pct, setPct] = useState(0);
  const { notice, show } = useSkipNotice();
  const showRef = useRef(show); showRef.current = show;
  const id = useMemo(() => url.match(/vimeo\.com\/(\d+)/)?.[1], [url]);
  const doneRef = useRef(done); doneRef.current = done;
  const reportRef = useRef(onReport); reportRef.current = onReport;
  const reachedEndRef = useRef(onReachedEnd); reachedEndRef.current = onReachedEnd;

  useEffect(() => {
    if (!id) return;
    function post(msg: any) {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    }
    function onMessage(ev: MessageEvent) {
      if (!ev.origin.includes("vimeo.com")) return;
      try {
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (data?.event === "ready") {
          post({ method: "addEventListener", value: "timeupdate" });
          post({ method: "addEventListener", value: "ended" });
        }
        if (data?.event === "timeupdate" && data.data) {
          const secs = data.data.seconds ?? 0;
          const dur = data.data.duration ?? 0;
          if (dur > 0) durRef.current = dur;
          if (!doneRef.current && secs > maxWatched.current + SEEK_TOLERANCE) {
            post({ method: "setCurrentTime", value: maxWatched.current });
            showRef.current();
            return;
          }
          maxWatched.current = Math.max(maxWatched.current, secs);
          reportRef.current(maxWatched.current, dur);
          const p = dur > 0 ? (maxWatched.current / dur) * 100 : 0;
          setPct(p);
          if (p >= 95 && !reached.current) { reached.current = true; reachedEndRef.current(); }
        }
        if (data?.event === "ended") {
          // Ended without enough genuine watching (scrubbed to the end):
          // resume from the furthest watched point instead of stranding.
          if (!doneRef.current && durRef.current > 0 && maxWatched.current < durRef.current * SERVER_WATCH_FRACTION) {
            post({ method: "setCurrentTime", value: maxWatched.current });
            post({ method: "play" });
            showRef.current();
          } else {
            reachedEndRef.current();
          }
        }
      } catch {}
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) return <iframe src={url} className="aspect-video w-full rounded-xl bg-black" />;
  return (
    <div>
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
        <iframe
          ref={iframeRef}
          src={`https://player.vimeo.com/video/${id}?api=1&player_id=vimeo`}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--soft)] overflow-hidden">
        <div className="h-full bg-picton" style={{ width: `${pct}%` }} />
      </div>
      {notice && <p className="mt-1 text-xs text-orange">{notice}</p>}
    </div>
  );
}

function LoomEmbed({ url, done, onManualComplete }: { url: string; done: boolean; onManualComplete: () => void }) {
  const id = url.match(/loom\.com\/share\/([a-z0-9]+)/i)?.[1];
  return (
    <div>
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
        <iframe
          src={id ? `https://www.loom.com/embed/${id}` : url}
          className="h-full w-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
      {!done && (
        <div className="mt-3">
          <button onClick={onManualComplete} className="gt-btn-ghost text-sm">I have watched this video</button>
          <p className="text-xs text-[var(--muted)] mt-1">Loom playback can&apos;t be measured automatically — confirm once you&apos;ve watched it fully.</p>
        </div>
      )}
    </div>
  );
}
