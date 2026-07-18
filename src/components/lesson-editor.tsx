"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type QType = "MULTIPLE_CHOICE" | "OPEN_ENDED";
type EditAnswer = { id?: string; text: string; isCorrect: boolean };
type EditQuestion = { id?: string; type: QType; prompt: string; points: number; answers: EditAnswer[] };

const PROVIDERS = [
  { key: "YOUTUBE", label: "YouTube" },
  { key: "VIMEO", label: "Vimeo" },
  { key: "LOOM", label: "Loom" },
  { key: "UPLOAD", label: "Upload" },
] as const;

function embedUrl(provider: string, url: string): string | null {
  if (!url) return null;
  if (provider === "YOUTUBE") {
    const id = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (provider === "VIMEO") {
    const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (provider === "LOOM") {
    const id = url.match(/loom\.com\/share\/([a-z0-9]+)/i)?.[1];
    return id ? `https://www.loom.com/embed/${id}` : null;
  }
  return null;
}

/** Interactive lesson editor for the demo flow: pills, live video preview, slider, Enter-to-add answers. */
export function LessonEditor({
  courseId,
  lessonId,
  title,
  content,
  video,
  quiz,
}: {
  courseId: string;
  lessonId: string;
  title: string;
  content: string;
  video: { provider: string; url: string } | null;
  quiz: { id: string; passThreshold: number; retryLimit: number; questions: EditQuestion[] } | null;
}) {
  const router = useRouter();
  const [t, setTitle] = useState(title);
  const [c, setContent] = useState(content);
  const [provider, setProvider] = useState(video?.provider ?? "YOUTUBE");
  const [url, setUrl] = useState(video?.url ?? "");
  const [pass, setPass] = useState(quiz?.passThreshold ?? 70);
  const [retry, setRetry] = useState(quiz?.retryLimit ?? 3);
  const [questions, setQuestions] = useState<EditQuestion[]>(quiz?.questions ?? []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const preview = useMemo(
    () => (provider === "UPLOAD" ? null : embedUrl(provider, url)),
    [provider, url]
  );

  async function save(thenBack: boolean) {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/lessons/${lessonId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: t,
        content: c,
        video: url ? { provider, url } : null,
        quiz: { passThreshold: Number(pass), retryLimit: Number(retry), questions },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error ?? "Save failed.");
      return;
    }
    if (thenBack) {
      router.push(`/instructor/courses/${courseId}/curriculum`);
      router.refresh();
    } else {
      setMsg("Saved ✓");
      router.refresh();
      setTimeout(() => setMsg(null), 2000);
    }
  }

  function addQuestion(type: QType) {
    setQuestions((qs) => [
      ...qs,
      {
        type,
        prompt: "",
        points: 1,
        answers:
          type === "MULTIPLE_CHOICE"
            ? [
                { text: "", isCorrect: true },
                { text: "", isCorrect: false },
              ]
            : [{ text: "", isCorrect: true }],
      },
    ]);
  }
  function patchQuestion(qi: number, patch: Partial<EditQuestion>) {
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="gt-card p-6 space-y-4">
        <div>
          <label className="gt-label">Title</label>
          <input className="gt-input text-lg" value={t} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="gt-label">Content / notes <span className="text-[var(--muted)] font-normal">(optional)</span></label>
          <textarea className="gt-input min-h-[100px]" value={c} onChange={(e) => setContent(e.target.value)} placeholder="Shown above the video — context, instructions, links…" />
        </div>
      </div>

      <div className="gt-card p-6 space-y-4">
        <h3 className="font-bold">Video</h3>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.key}
              className={`cursor-pointer select-none rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                provider === p.key ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"
              }`}
            >
              <input type="radio" name="provider" className="sr-only" checked={provider === p.key} onChange={() => setProvider(p.key)} />
              {provider === p.key ? "✓ " : ""}
              {p.label}
            </label>
          ))}
        </div>
        {provider !== "UPLOAD" && (
          <input className="gt-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`Paste the ${PROVIDERS.find((p) => p.key === provider)?.label} link…`} />
        )}
        {provider === "UPLOAD" && <VideoUploader currentUrl={url} onUploaded={setUrl} />}

        {preview && (
          <div className="aspect-video w-full max-w-xl overflow-hidden rounded-xl bg-black">
            <iframe src={preview} className="h-full w-full" allowFullScreen />
          </div>
        )}
        {provider === "UPLOAD" && url && (
          <video src={url} controls className="w-full max-w-xl rounded-xl bg-black aspect-video" />
        )}
        {!url && <p className="text-xs text-[var(--muted)]">No video yet — the lesson works without one, but trainees must watch it before the quiz unlocks when set.</p>}
      </div>

      <div className="gt-card p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-6">
          <h3 className="font-bold mr-auto">Quiz</h3>
          <div>
            <label className="gt-label">Pass threshold</label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={100} className="w-40 accent-[#233b8f]" value={pass} onChange={(e) => setPass(Number(e.target.value))} />
              <span className="w-12 text-sm font-semibold">{pass}%</span>
            </div>
          </div>
          <div>
            <label className="gt-label">Attempts allowed</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setRetry((r) => Math.max(1, r - 1))} className="gt-btn-ghost px-3">−</button>
              <span className="w-6 text-center text-sm font-semibold">{retry}</span>
              <button type="button" onClick={() => setRetry((r) => Math.min(10, r + 1))} className="gt-btn-ghost px-3">+</button>
            </div>
          </div>
        </div>

        {questions.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            No questions yet — add one below. Lessons without a quiz complete on video watch alone.
          </div>
        )}

        {questions.map((q, qi) => (
          <div key={qi} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-navy text-white text-xs font-bold">{qi + 1}</span>
              <span className={`gt-badge ${q.type === "MULTIPLE_CHOICE" ? "bg-picton/15 text-picton" : "bg-gold/15 text-gold"}`}>
                {q.type === "MULTIPLE_CHOICE" ? "Multiple choice" : "Open ended"}
              </span>
              <span className="ml-auto flex items-center gap-1 text-xs text-[var(--muted)]">
                worth
                <input type="number" min={1} className="gt-input w-16 py-1 text-center" value={q.points} onChange={(e) => patchQuestion(qi, { points: Number(e.target.value) })} />
                pts
              </span>
              <button onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} className="px-1 text-[var(--muted)] hover:text-orange" title="Remove question">✕</button>
            </div>
            <input className="gt-input font-medium" value={q.prompt} onChange={(e) => patchQuestion(qi, { prompt: e.target.value })} placeholder="Type the question…" />

            <div className="space-y-2">
              {q.answers.map((a, ai) => (
                <div key={ai} className="flex items-center gap-2">
                  <input
                    type={q.type === "MULTIPLE_CHOICE" ? "radio" : "checkbox"}
                    name={`q-${qi}-correct`}
                    checked={a.isCorrect}
                    title="Correct answer"
                    onChange={() =>
                      patchQuestion(qi, {
                        answers: q.answers.map((aa, j) =>
                          q.type === "MULTIPLE_CHOICE" ? { ...aa, isCorrect: j === ai } : j === ai ? { ...aa, isCorrect: !aa.isCorrect } : aa
                        ),
                      })
                    }
                  />
                  <input
                    className={`gt-input ${a.isCorrect ? "border-mint/60" : ""}`}
                    value={a.text}
                    onChange={(e) => patchQuestion(qi, { answers: q.answers.map((aa, j) => (j === ai ? { ...aa, text: e.target.value } : aa)) })}
                    placeholder={q.type === "MULTIPLE_CHOICE" ? "Answer option" : "Accepted answer (reviewed by an instructor)"}
                  />
                  <button onClick={() => patchQuestion(qi, { answers: q.answers.filter((_, j) => j !== ai) })} className="px-1 text-[var(--muted)] hover:text-orange" title="Remove answer">✕</button>
                </div>
              ))}
              {q.type === "MULTIPLE_CHOICE" && (
                <AnswerAdd onAdd={(text) => patchQuestion(qi, { answers: [...q.answers, { text, isCorrect: false }] })} />
              )}
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button type="button" className="gt-btn-ghost" onClick={() => addQuestion("MULTIPLE_CHOICE")}>+ Multiple choice</button>
          <button type="button" className="gt-btn-ghost" onClick={() => addQuestion("OPEN_ENDED")}>+ Open ended</button>
        </div>
      </div>

      <div className="sticky bottom-4 z-10">
        <div className="gt-card flex items-center gap-3 px-5 py-3 shadow-soft">
          <span className="text-xs text-[var(--muted)] mr-auto">{msg ?? "Changes are saved when you hit Save."}</span>
          <button onClick={() => save(false)} disabled={saving} className="gt-btn-ghost">{saving ? "…" : "Save"}</button>
          <button onClick={() => save(true)} disabled={saving} className="gt-btn-primary">{saving ? "Saving…" : "Save & back to curriculum →"}</button>
        </div>
      </div>
    </div>
  );
}

/** Empty answer row — Enter adds and keeps focus for the next option. */
function AnswerAdd({ onAdd }: { onAdd: (text: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-center gap-2 pl-6">
      <input
        className="gt-input border-dashed"
        value={v}
        placeholder="Add an answer — press Enter"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const t = v.trim();
            if (t) { onAdd(t); setV(""); }
          }
        }}
      />
    </div>
  );
}

function VideoUploader({ currentUrl, onUploaded }: { currentUrl: string; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    setPct(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads/video");
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100)); };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        onUploaded(JSON.parse(xhr.responseText).url);
      } else {
        try { setErr(JSON.parse(xhr.responseText).error ?? "Upload failed"); } catch { setErr("Upload failed"); }
      }
    };
    xhr.onerror = () => { setUploading(false); setErr("Upload failed"); };
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  }

  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] p-4">
      <label className="gt-label">{currentUrl ? "Replace the video file" : "Upload a video file"}</label>
      <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" onChange={handle} disabled={uploading} />
      {uploading && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--soft)]"><div className="h-full bg-picton" style={{ width: `${pct}%` }} /></div>
          <div className="mt-1 text-xs text-[var(--muted)]">{pct}%</div>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-orange">{err}</p>}
      <p className="mt-2 text-xs text-[var(--muted)]">MP4, WebM, OGG or MOV. Max 500 MB.</p>
    </div>
  );
}
