"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type QType = "MULTIPLE_CHOICE" | "OPEN_ENDED";
type EditAnswer = { id?: string; text: string; isCorrect: boolean };
type EditQuestion = { id?: string; type: QType; prompt: string; points: number; answers: EditAnswer[] };

export function LessonEditor({
  lessonId,
  title,
  content,
  video,
  quiz,
}: {
  lessonId: string;
  title: string;
  content: string;
  video: { provider: string; url: string; duration: number } | null;
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

  async function saveLesson() {
    setSaving(true);
    await fetch(`/api/lessons/${lessonId}`, {
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
    setMsg("Saved.");
    router.refresh();
    setTimeout(() => setMsg(null), 1500);
  }

  function addQuestion(type: QType) {
    setQuestions((qs) => [...qs, {
      type, prompt: "", points: 1,
      answers: type === "MULTIPLE_CHOICE"
        ? [{ text: "", isCorrect: true }, { text: "", isCorrect: false }]
        : [{ text: "", isCorrect: true }],
    }]);
  }

  return (
    <div className="space-y-6">
      <div className="gt-card p-6 space-y-4">
        <div><label className="gt-label">Title</label><input className="gt-input" value={t} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="gt-label">Content / notes</label><textarea className="gt-input min-h-[120px]" value={c} onChange={(e) => setContent(e.target.value)} /></div>
      </div>

      <div className="gt-card p-6 space-y-4">
        <h3 className="font-bold">Video</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="gt-label">Provider</label>
            <select className="gt-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="YOUTUBE">YouTube</option>
              <option value="VIMEO">Vimeo</option>
              <option value="LOOM">Loom</option>
              <option value="UPLOAD">Direct upload</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="gt-label">URL</label>
            <input className="gt-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>
        {provider === "UPLOAD" && <VideoUploader onUploaded={setUrl} />}
        <p className="text-xs text-[var(--muted)]">Trainees must watch the full video before the quiz unlocks.</p>
      </div>

      <div className="gt-card p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <h3 className="font-bold mr-auto">Quiz</h3>
          <div><label className="gt-label">Pass %</label><input type="number" min={0} max={100} className="gt-input w-28" value={pass} onChange={(e) => setPass(Number(e.target.value))} /></div>
          <div><label className="gt-label">Retry limit</label><input type="number" min={1} max={10} className="gt-input w-28" value={retry} onChange={(e) => setRetry(Number(e.target.value))} /></div>
        </div>

        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div key={qi} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Q{qi + 1} · {q.type === "MULTIPLE_CHOICE" ? "Multiple choice" : "Open ended"}</div>
                <button onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} className="text-xs text-orange">Remove</button>
              </div>
              <input className="gt-input" value={q.prompt} onChange={(e) => setQuestions((qs) => qs.map((x, i) => i === qi ? { ...x, prompt: e.target.value } : x))} placeholder="Prompt" />
              <div>
                <label className="gt-label">Points</label>
                <input type="number" min={1} className="gt-input w-24" value={q.points} onChange={(e) => setQuestions((qs) => qs.map((x, i) => i === qi ? { ...x, points: Number(e.target.value) } : x))} />
              </div>
              <div className="space-y-2">
                {q.answers.map((a, ai) => (
                  <div key={ai} className="flex items-center gap-2">
                    <input
                      type={q.type === "MULTIPLE_CHOICE" ? "radio" : "checkbox"}
                      name={`q-${qi}-correct`}
                      checked={a.isCorrect}
                      onChange={() => setQuestions((qs) => qs.map((x, i) => {
                        if (i !== qi) return x;
                        return {
                          ...x,
                          answers: x.answers.map((aa, j) =>
                            q.type === "MULTIPLE_CHOICE"
                              ? { ...aa, isCorrect: j === ai }
                              : j === ai ? { ...aa, isCorrect: !aa.isCorrect } : aa),
                        };
                      }))}
                    />
                    <input
                      className="gt-input"
                      value={a.text}
                      onChange={(e) => setQuestions((qs) => qs.map((x, i) => i === qi
                        ? { ...x, answers: x.answers.map((aa, j) => j === ai ? { ...aa, text: e.target.value } : aa) }
                        : x))}
                      placeholder={q.type === "MULTIPLE_CHOICE" ? "Answer option" : "Accepted answer text"}
                    />
                    <button
                      onClick={() => setQuestions((qs) => qs.map((x, i) => i === qi
                        ? { ...x, answers: x.answers.filter((_, j) => j !== ai) }
                        : x))}
                      className="text-xs text-orange"
                    >Remove</button>
                  </div>
                ))}
                <button
                  className="gt-btn-ghost text-sm"
                  onClick={() => setQuestions((qs) => qs.map((x, i) => i === qi
                    ? { ...x, answers: [...x.answers, { text: "", isCorrect: false }] }
                    : x))}
                >+ Add answer</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="gt-btn-ghost" onClick={() => addQuestion("MULTIPLE_CHOICE")}>+ Multiple choice</button>
          <button className="gt-btn-ghost" onClick={() => addQuestion("OPEN_ENDED")}>+ Open ended</button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={saveLesson} disabled={saving} className="gt-btn-primary">{saving ? "Saving…" : "Save lesson"}</button>
        {msg && <span className="text-sm text-mint">{msg}</span>}
      </div>
    </div>
  );
}

function VideoUploader({ onUploaded }: { onUploaded: (url: string) => void }) {
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
        const data = JSON.parse(xhr.responseText);
        onUploaded(data.url);
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
      <label className="gt-label">Upload a video file</label>
      <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" onChange={handle} disabled={uploading} />
      {uploading && (
        <div className="mt-3">
          <div className="h-1.5 w-full rounded-full bg-[var(--soft)] overflow-hidden"><div className="h-full bg-picton" style={{ width: `${pct}%` }} /></div>
          <div className="text-xs text-[var(--muted)] mt-1">{pct}%</div>
        </div>
      )}
      {err && <p className="text-sm text-orange mt-2">{err}</p>}
      <p className="text-xs text-[var(--muted)] mt-2">MP4, WebM, OGG or MOV. Max 500 MB.</p>
    </div>
  );
}
