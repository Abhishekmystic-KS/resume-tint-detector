import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSegments, cleanText, scanResume, type Finding, type ScanReport } from "@/lib/detect";
import { extractFile } from "@/lib/extract";
import { reviewResume, type ReviewResult } from "@/lib/review.functions";
import { loadUserKey, reviewWithUserKey, saveUserKey } from "@/lib/user-gemini";
import { ReviewMarkdown } from "@/components/ReviewMarkdown";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vermilion — Resume Watermark & AI Fingerprint Checker" },
      {
        name: "description",
        content:
          "Drop in a resume and see hidden characters, file metadata traces, and the phrasing that makes it read as AI-written — every flag highlighted in light red, with a fix for each.",
      },
      { property: "og:title", content: "Vermilion — Resume Watermark & AI Fingerprint Checker" },
      {
        property: "og:description",
        content:
          "Scan a resume for invisible characters, metadata traces, and AI writing fingerprints. Everything flagged is highlighted, with a rewrite for each line.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SEV_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function Index() {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runReview = useServerFn(reviewResume);
  const [userKey, setUserKey] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    const stored = loadUserKey();
    if (stored) {
      setUserKey(stored);
      setKeySaved(true);
    }
  }, []);

  const run = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setReview(null);
    try {
      const { text, meta } = await extractFile(file);
      if (text.replace(/\s/g, "").length < 60) {
        throw new Error(
          "Almost no text came out of this file. It is probably a scan or an image — export a text-based PDF instead.",
        );
      }
      setReport(scanResume(text, meta));
      setActive(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const runPaste = useCallback(() => {
    if (paste.replace(/\s/g, "").length < 60) {
      setError("Paste a bit more of the resume — at least a few lines.");
      return;
    }
    setError(null);
    setReview(null);
    setReport(scanResume(paste, { fileName: "pasted text" }));
    setActive(null);
    setPasteOpen(false);
  }, [paste]);

  const askAi = useCallback(async () => {
    if (!report) return;
    setReviewing(true);
    setReview(null);
    const text = report.text.slice(0, 24000);
    const findings = report.findings.map((f) => f.title);
    try {
      const trimmed = userKey.trim();
      const res = trimmed
        ? await reviewWithUserKey(trimmed, text, findings)
        : await runReview({ data: { text, findings } });
      setReview(res);
    } catch (e) {
      setReview({ ok: false, error: (e as Error).message });
    } finally {
      setReviewing(false);
    }
  }, [report, runReview, userKey]);


  const segments = useMemo(
    () => (report ? buildSegments(report.text, report.findings) : []),
    [report],
  );
  const byId = useMemo(() => {
    const m = new Map<string, Finding>();
    report?.findings.forEach((f) => m.set(f.id, f));
    return m;
  }, [report]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void run(f);
  };

  return (
    <div className="min-h-screen bg-ink font-body text-pale">
      <header className="relative border-b border-edge/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg border border-pale/10 bg-gradient-to-br from-pale/15 to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
              <span className="font-display text-sm font-bold text-high">V</span>
            </div>
            <div className="leading-tight">
              <p className="font-display text-[15px] font-semibold tracking-tight">Vermilion</p>
              <p className="text-[10px] uppercase tracking-[0.28em] text-mute">Watermark Forensics</p>
            </div>
          </div>
          {report ? (
            <button
              onClick={() => {
                setReport(null);
                setReview(null);
                setError(null);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-pale/10 bg-pale/5 px-4 py-2 text-[13px] transition-colors hover:bg-pale/10"
            >
              <span className="size-1.5 rounded-full bg-high shadow-[0_0_8px_var(--high)]" />
              Scan another
            </button>
          ) : (
            <span className="font-mono text-[11px] text-mute">read in your browser</span>
          )}
        </div>
      </header>

      {!report ? (
        <Landing
          busy={busy}
          error={error}
          dragging={dragging}
          setDragging={setDragging}
          onDrop={onDrop}
          inputRef={inputRef}
          run={run}
          pasteOpen={pasteOpen}
          setPasteOpen={setPasteOpen}
          paste={paste}
          setPaste={setPaste}
          runPaste={runPaste}
        />
      ) : (
        <main className="mx-auto max-w-6xl px-6 py-10">
          <div
            className={`flex flex-wrap items-center gap-5 rounded-2xl px-6 py-5 ${
              report.verdict === "marked"
                ? "mark-flag"
                : "border border-edge bg-surface/50"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute">Verdict</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-pale">
                {report.verdict === "marked"
                  ? "Hidden marks found in this file"
                  : report.verdict === "traces"
                    ? "No hidden watermark — but it reads as AI-written"
                    : "Clean. Nothing hidden, nothing generic."}
              </h1>
              <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-mute">
                {report.verdict === "marked"
                  ? "This resume carries invisible characters or file properties that a person can uncover but nobody can see on the page. Everything found is highlighted below."
                  : report.verdict === "traces"
                    ? "Nothing invisible is buried in the file. What stands out is the writing itself — the patterns a screener recognises in seconds."
                    : "No invisible characters, no revealing file properties, and no stock phrasing worth flagging."}
              </p>
            </div>
            <div className="text-right">
              <div className="font-display text-4xl font-semibold leading-none text-high">
                {report.score}
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-mute">
                / 100 human signal
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-mute">
            <span>{report.meta.fileName}</span>
            {report.meta.pages ? <span>{report.meta.pages} pages</span> : null}
            <span>{report.stats.words} words</span>
            <span>{report.stats.bullets} bullets</span>
            <span className={report.stats.hiddenChars ? "text-high" : ""}>
              {report.stats.hiddenChars} invisible characters
            </span>
            {report.meta.producer ? <span>produced by {report.meta.producer}</span> : null}
          </div>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            {/* document */}
            <section className="panel rounded-2xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-high" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-mute">
                    Your resume, annotated
                  </span>
                </div>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(cleanText(report.text));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="rounded-lg bg-pale px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-pale/90"
                >
                  {copied ? "Copied clean text" : "Copy cleaned text"}
                </button>
              </div>
              <div className="glowline mb-5" />
              <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap text-[13.5px] leading-relaxed text-pale/85">
                {segments.map((s, i) =>
                  s.findingId ? (
                    <mark
                      key={i}
                      onClick={() => setActive(s.findingId!)}
                      className={`cursor-pointer text-pale ${
                        active === s.findingId ? "mark-flag-active" : "mark-flag"
                      }`}
                      title={byId.get(s.findingId)?.title}
                    >
                      {s.invisible ? (
                        <span className="font-mono text-[10px] text-high">⌷</span>
                      ) : (
                        s.text
                      )}
                    </mark>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
              </div>
            </section>

            {/* findings */}
            <aside className="space-y-3">
              {report.findings.length === 0 ? (
                <div className="rounded-xl border border-edge bg-surface/60 p-5 text-[13.5px] text-mute">
                  Nothing flagged. Keep the layout single-column and you are in good shape.
                </div>
              ) : (
                report.findings.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => setActive(active === f.id ? null : f.id)}
                    className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                      active === f.id
                        ? "border-high/50 bg-high-soft"
                        : "border-edge bg-surface/60 hover:bg-surface2/70"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
                        {String(i + 1).padStart(2, "0")} · {f.category}
                      </span>
                      <span
                        className={`ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                          f.severity === "critical" || f.severity === "high"
                            ? "bg-high text-ink"
                            : "bg-surface2 text-mute"
                        }`}
                      >
                        {SEV_LABEL[f.severity]}
                      </span>
                    </div>
                    <p className="mt-1.5 font-display text-[14px] font-semibold text-pale">
                      {f.title}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-mute">{f.detail}</p>
                    <div className="mt-2.5 rounded-lg bg-ink/60 p-2.5">
                      <p className="font-mono text-[9px] uppercase tracking-wider text-high">Fix</p>
                      <p className="mt-0.5 text-[12.5px] text-pale/90">{f.fix}</p>
                    </div>
                  </button>
                ))
              )}

              <div className="rounded-xl border border-edge bg-surface/60 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">
                  Worth knowing
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
                  Applicant tracking systems do not detect AI authorship. The statistical
                  "watermark" chat models add lives in word choice, not in hidden characters, and no
                  resume parser can read it. What actually gets people rejected is a layout the
                  parser scrambles, or a human noticing generated prose.
                </p>
              </div>
            </aside>
          </div>

          {/* AI review */}
          <section className="panel mt-6 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-tight text-pale">
                  Line-by-line rewrite
                </h2>
                <p className="mt-1 text-[13px] text-mute">
                  A second read that quotes your weakest lines back to you and rewrites them.
                </p>
              </div>
              <button
                onClick={() => void askAi()}
                disabled={reviewing}
                className="rounded-lg bg-high px-4 py-2.5 text-[13px] font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {reviewing ? "Reading…" : review?.ok ? "Read again" : "Get the rewrite"}
              </button>
            </div>

            {reviewing ? (
              <div className="glowline mt-5 scan-sweep" />
            ) : review ? (
              review.ok && review.markdown ? (
                <div className="mt-5 border-t border-edge pt-5">
                  <ReviewMarkdown source={review.markdown} />
                </div>
              ) : (
                <p className="mt-5 rounded-lg border border-high/40 bg-high-soft p-3 text-[13px] text-pale">
                  {review.error}
                </p>
              )
            ) : null}
          </section>
        </main>
      )}
    </div>
  );
}

function Landing(props: {
  busy: boolean;
  error: string | null;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  run: (f: File) => void;
  pasteOpen: boolean;
  setPasteOpen: (v: boolean) => void;
  paste: string;
  setPaste: (v: string) => void;
  runPaste: () => void;
}) {
  const {
    busy,
    error,
    dragging,
    setDragging,
    onDrop,
    inputRef,
    run,
    pasteOpen,
    setPasteOpen,
    paste,
    setPaste,
    runPaste,
  } = props;

  return (
    <section className="relative overflow-hidden">
      <div className="glow-field pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-edge bg-surface/60 px-3 py-1.5 text-[11px] text-mute">
            <span className="size-1.5 rounded-full bg-high" />
            client-side forensics · nothing is uploaded
          </div>
          <h1 className="font-display text-[clamp(2.6rem,5.2vw,4.1rem)] font-semibold leading-[1.02] tracking-tight text-pale">
            See the watermark
            <br />
            your resume is{" "}
            <span className="text-high drop-shadow-[0_0_24px_var(--high-soft)]">hiding.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-mute">
            Drop a resume in and the scanner reads every layer for invisible characters, file
            properties that name the tool that wrote it, and the phrasing that makes a recruiter
            stop reading — each one painted in light red.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-8 rounded-2xl border border-dashed p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors ${
              dragging ? "border-high bg-high-soft" : "border-edge bg-surface/40"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-pale/10 bg-gradient-to-b from-pale/10 to-transparent font-display text-lg text-high">
                ↑
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-pale">
                  {busy ? "Reading the file…" : "Drop your resume here"}
                </p>
                <p className="text-[11px] text-mute">
                  PDF, DOCX or TXT · analysed entirely in your browser
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) run(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="rounded-lg bg-pale px-4 py-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-pale/90 disabled:opacity-50"
              >
                Choose file
              </button>
            </div>
          </div>

          <button
            onClick={() => setPasteOpen(!pasteOpen)}
            className="mt-3 text-[12px] text-mute underline-offset-4 transition-colors hover:text-pale hover:underline"
          >
            or paste the text instead
          </button>

          {pasteOpen ? (
            <div className="mt-3">
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={7}
                placeholder="Paste your resume text here…"
                className="w-full resize-y rounded-xl border border-edge bg-surface/60 p-3 font-mono text-[12.5px] text-pale outline-none placeholder:text-mute focus:border-high/60"
              />
              <button
                onClick={runPaste}
                className="mt-2 rounded-lg bg-high px-4 py-2 text-[13px] font-medium text-ink transition-opacity hover:opacity-90"
              >
                Scan this text
              </button>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-lg border border-high/40 bg-high-soft p-3 text-[12.5px] text-pale">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-4 text-[11px] text-mute">
            <span className="flex items-center gap-1.5">
              <span className="mark-flag h-2 w-3" /> Flagged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-pale/10" /> Clean text
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="doc-float panel relative rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-high" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-mute">
                  Sample result
                </span>
              </div>
              <span className="font-mono text-[10px] text-mute">p.1 / 2</span>
            </div>
            <div className="h-3 w-40 rounded bg-pale/20" />
            <div className="mt-2 h-2 w-24 rounded bg-pale/10" />
            <div className="glowline my-5" />
            <div className="mark-flag -mx-2 mb-3 px-2 py-1.5">
              <div className="h-2.5 w-full rounded-sm bg-high/70" />
              <p className="mt-1.5 font-mono text-[10px] text-high">
                FLAG · zero-width characters inside "JavaScript"
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full rounded bg-pale/12" />
              <div className="h-2 w-11/12 rounded bg-pale/12" />
              <div className="h-2 w-4/5 rounded bg-pale/12" />
            </div>
            <div className="glowline my-5" />
            <div className="mark-flag -mx-2 px-2 py-2">
              <div className="flex items-center justify-between">
                <span className="h-2.5 w-1/3 rounded-sm bg-high/70" />
                <span className="h-2.5 w-1/5 rounded-sm bg-high/50" />
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-high">
                FLAG · file properties name the generator
              </p>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-2 w-10/12 rounded bg-pale/12" />
              <div className="h-2 w-3/4 rounded bg-pale/12" />
            </div>
          </div>
          <div className="absolute -left-5 top-16 rounded-xl border border-edge bg-surface2 px-4 py-3 shadow-xl">
            <p className="text-[10px] uppercase tracking-widest text-mute">Verdict</p>
            <p className="font-display text-lg font-semibold text-pale">2 marked</p>
          </div>
          <div className="absolute -bottom-5 -right-3 rounded-xl border border-edge bg-surface2 px-4 py-3 shadow-xl">
            <p className="text-[10px] uppercase tracking-widest text-mute">Human signal</p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-pale/10">
                <div className="h-full w-1/5 bg-high" />
              </div>
              <span className="font-mono text-[11px] text-pale">21%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
