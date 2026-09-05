export type Severity = "critical" | "high" | "medium" | "low";

export type Span = { start: number; end: number; findingId: string };

export type Finding = {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  count: number;
  spans: { start: number; end: number }[];
};

export type DocMeta = {
  fileName?: string;
  pages?: number;
  producer?: string;
  creator?: string;
  title?: string;
  author?: string;
};

export type ScanReport = {
  text: string;
  meta: DocMeta;
  findings: Finding[];
  score: number;
  verdict: "clean" | "traces" | "marked";
  stats: {
    words: number;
    bullets: number;
    hiddenChars: number;
  };
};

/* ---------------- invisible / watermark-ish characters ---------------- */

const INVISIBLES: { re: RegExp; name: string }[] = [
  { re: /\u200B/g, name: "zero-width space" },
  { re: /\u200C/g, name: "zero-width non-joiner" },
  { re: /\u200D/g, name: "zero-width joiner" },
  { re: /\uFEFF/g, name: "zero-width no-break space" },
  { re: /\u2060/g, name: "word joiner" },
  { re: /\u00AD/g, name: "soft hyphen" },
  { re: /[\u202A-\u202E\u2066-\u2069]/g, name: "bidirectional control mark" },
  { re: /[\u180E\u2000-\u200A\u205F\u3000]/g, name: "unusual-width space" },
  { re: /\u00A0/g, name: "non-breaking space" },
  { re: /[\uE000-\uF8FF]/g, name: "private-use glyph" },
];

const HOMOGLYPHS = /[\u0410-\u044F\u0391-\u03C9\u2010\u2011\u2044\u01C3]/g;

/* ---------------- language fingerprints ---------------- */

const BUZZWORDS = [
  "spearheaded", "leveraged", "leveraging", "leverage", "utilized", "utilize",
  "orchestrated", "synergy", "synergies", "holistic", "seamless", "seamlessly",
  "cutting-edge", "state-of-the-art", "best-in-class", "world-class", "next-gen",
  "robust", "scalable solutions", "results-driven", "proven track record",
  "dynamic environment", "fast-paced environment", "meticulous", "meticulously",
  "delve", "delved", "pivotal", "underscores", "tapestry", "showcasing",
  "commitment to excellence", "passionate about", "detail-oriented",
  "team player", "go-getter", "thought leadership", "transformative",
  "revolutionized", "game-changing", "value-add", "mission-critical",
];

const GENERIC_PHRASES = [
  "cross-functional teams",
  "wide range of",
  "various stakeholders",
  "business impact",
  "drive innovation",
  "streamline processes",
  "optimize performance",
  "end-to-end solutions",
  "actionable insights",
  "in a fast-paced environment",
  "responsible for",
  "worked closely with",
  "helped improve",
  "contributed to the development of",
  "it is worth noting",
  "not only",
];

const AI_TYPOGRAPHY: { re: RegExp; name: string }[] = [
  { re: /\u2014/g, name: "em dash" },
  { re: /[\u2018\u2019]/g, name: "curly apostrophe" },
  { re: /[\u201C\u201D]/g, name: "curly quote" },
  { re: /\u2026/g, name: "ellipsis character" },
];

const ROUND_METRIC = /\b(?:10|15|20|25|30|35|40|45|50|60|70|75|80|90|100|200|500|1000)\s?(?:%|percent|x|X)\b/g;

/* ---------------- helpers ---------------- */

function collect(text: string, re: RegExp) {
  const out: { start: number; end: number; value: string }[] = [];
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    out.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
    if (m[0].length === 0) rx.lastIndex++;
  }
  return out;
}

function wordListRegex(words: string[]) {
  const escaped = words
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\w-])(${escaped.join("|")})(?![\\w-])`, "gi");
}

function getBullets(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^([•▪◦‣\-–*·]|\d+[.)])\s+/.test(l) && l.length > 20);
}

const SEV_WEIGHT: Record<Severity, number> = { critical: 26, high: 14, medium: 8, low: 4 };

/* ---------------- main ---------------- */

export function scanResume(text: string, meta: DocMeta = {}): ScanReport {
  const findings: Finding[] = [];
  const push = (f: Omit<Finding, "count"> & { count?: number }) => {
    if (!f.spans.length && !f.count) return;
    findings.push({ ...f, count: f.count ?? f.spans.length });
  };

  /* 1. invisible characters — the only literal "watermark" a document can carry */
  let hiddenChars = 0;
  const invisibleSpans: { start: number; end: number }[] = [];
  const invisibleNames = new Map<string, number>();
  for (const { re, name } of INVISIBLES) {
    const hits = collect(text, re);
    if (!hits.length) continue;
    hiddenChars += hits.length;
    invisibleNames.set(name, (invisibleNames.get(name) ?? 0) + hits.length);
    for (const h of hits) invisibleSpans.push({ start: h.start, end: h.end });
  }
  if (invisibleSpans.length) {
    const listed = [...invisibleNames.entries()].map(([n, c]) => `${c}× ${n}`).join(", ");
    push({
      id: "hidden-unicode",
      category: "Hidden characters",
      severity: "critical",
      title: "Invisible characters embedded in the text",
      detail: `Found ${listed}. These are characters you cannot see on screen. They travel with copy-paste and can split words apart for a resume parser — "Java\u200BScript" is not "JavaScript" to a keyword matcher.`,
      fix: "Paste the resume into a plain text editor, retype the affected lines, and re-export. Use the Clean copy button below to get a stripped version.",
      spans: invisibleSpans,
    });
  }

  /* 2. look-alike letters */
  const homo = collect(text, HOMOGLYPHS);
  if (homo.length) {
    push({
      id: "homoglyphs",
      category: "Hidden characters",
      severity: "high",
      title: "Look-alike letters from another alphabet",
      detail: `${homo.length} character${homo.length > 1 ? "s" : ""} that look like normal Latin letters or hyphens but are Cyrillic, Greek, or typographic substitutes. Search and keyword matching treats them as different letters entirely.`,
      fix: "Retype those words directly instead of pasting them from a styled source.",
      spans: homo.map((h) => ({ start: h.start, end: h.end })),
    });
  }

  /* 3. document metadata */
  const producerBlob = `${meta.producer ?? ""} ${meta.creator ?? ""} ${meta.title ?? ""} ${meta.author ?? ""}`.toLowerCase();
  const suspectTools = ["chatgpt", "openai", "claude", "anthropic", "gemini", "copilot", "resume.io", "zety", "kickresume", "rezi", "teal", "enhancv", "novoresume"];
  const hitTool = suspectTools.find((t) => producerBlob.includes(t));
  if (hitTool) {
    push({
      id: "metadata-producer",
      category: "File metadata",
      severity: "critical",
      title: "The file's hidden properties name the tool that made it",
      detail: `The document properties contain "${hitTool}". Anyone can read this by opening File → Properties — it never appears on the printed page, which is exactly what makes it feel like a watermark.`,
      fix: "Re-export the file from a plain editor, or clear the Title, Author, and Producer fields in the document properties before sending.",
      spans: [],
      count: 1,
    });
  }

  /* 4. typography tells */
  const typoSpans: { start: number; end: number }[] = [];
  const typoNames = new Map<string, number>();
  for (const { re, name } of AI_TYPOGRAPHY) {
    const hits = collect(text, re);
    if (!hits.length) continue;
    typoNames.set(name, hits.length);
    for (const h of hits) typoSpans.push({ start: h.start, end: h.end });
  }
  if (typoSpans.length >= 3) {
    push({
      id: "typography",
      category: "Writing fingerprint",
      severity: "medium",
      title: "Typography that chat tools produce by default",
      detail: `${[...typoNames.entries()].map(([n, c]) => `${c}× ${n}`).join(", ")}. Resumes typed by hand rarely contain em dashes and curly quotes throughout — chat assistants insert them automatically.`,
      fix: "Replace em dashes with a comma or a plain hyphen, and straighten the quotes.",
      spans: typoSpans,
    });
  }

  /* 5. buzzword stacking */
  const buzz = collect(text, wordListRegex(BUZZWORDS));
  if (buzz.length >= 2) {
    push({
      id: "buzzwords",
      category: "Writing fingerprint",
      severity: buzz.length >= 6 ? "high" : "medium",
      title: "Stacked buzzwords",
      detail: `${buzz.length} filler words a recruiter reads as generated copy: ${[...new Set(buzz.map((b) => b.value.toLowerCase()))].slice(0, 8).join(", ")}.`,
      fix: "Swap each one for the concrete thing you actually did — the tool you used, the number that moved, the person you convinced.",
      spans: buzz.map((b) => ({ start: b.start, end: b.end })),
    });
  }

  /* 6. generic phrasing */
  const generic = collect(text, wordListRegex(GENERIC_PHRASES));
  if (generic.length) {
    push({
      id: "generic",
      category: "Writing fingerprint",
      severity: generic.length >= 4 ? "high" : "medium",
      title: "Phrases that could describe anyone",
      detail: `${generic.length} stock phrase${generic.length > 1 ? "s" : ""} that carry no information about you specifically.`,
      fix: "Name the team size, the system, the customer, or the deadline instead of the category.",
      spans: generic.map((g) => ({ start: g.start, end: g.end })),
    });
  }

  /* 7. suspiciously round metrics */
  const round = collect(text, ROUND_METRIC);
  if (round.length) {
    push({
      id: "round-metrics",
      category: "Writing fingerprint",
      severity: round.length >= 3 ? "high" : "medium",
      title: "Suspiciously round numbers",
      detail: `${round.length} tidy figure${round.length > 1 ? "s" : ""} (${round.map((r) => r.value).slice(0, 6).join(", ")}). Real measurements are rarely this neat, and a screener who has read a thousand resumes notices.`,
      fix: 'Give the before and after: "cut page load from 3.1s to 1.4s" beats "improved performance by 50%".',
      spans: round.map((r) => ({ start: r.start, end: r.end })),
    });
  }

  /* 8. uniform bullet rhythm */
  const bullets = getBullets(text);
  if (bullets.length >= 4) {
    const lens = bullets.map((b) => b.split(/\s+/).length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    if (sd / mean < 0.18) {
      push({
        id: "bullet-uniformity",
        category: "Writing fingerprint",
        severity: "high",
        title: "Every bullet is the same length",
        detail: `${bullets.length} bullets averaging ${mean.toFixed(0)} words with almost no variation. Batch-generated text lands in a rhythm; human writing does not.`,
        fix: "Let some bullets run short and blunt, and give one or two room to explain a real trade-off.",
        spans: [],
        count: bullets.length,
      });
    }
  }

  /* 9. repeated sentence openers */
  const openers = new Map<string, number>();
  for (const b of bullets) {
    const first = b.replace(/^([•▪◦‣\-–*·]|\d+[.)])\s+/, "").split(/\s+/)[0]?.toLowerCase();
    if (first) openers.set(first, (openers.get(first) ?? 0) + 1);
  }
  const repeated = [...openers.entries()].filter(([, c]) => c >= 3);
  if (repeated.length) {
    push({
      id: "openers",
      category: "Writing fingerprint",
      severity: "low",
      title: "The same verb opens many bullets",
      detail: `${repeated.map(([w, c]) => `"${w}" ×${c}`).join(", ")}. A repeated opener reads as a template being filled in.`,
      fix: "Vary the verb, or drop it and lead with the result.",
      spans: [],
      count: repeated.length,
    });
  }

  const penalty = findings.reduce((a, f) => a + SEV_WEIGHT[f.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const verdict: ScanReport["verdict"] =
    hiddenChars > 0 || hitTool ? "marked" : findings.length ? "traces" : "clean";

  return {
    text,
    meta,
    findings: findings.sort(
      (a, b) =>
        ["critical", "high", "medium", "low"].indexOf(a.severity) -
        ["critical", "high", "medium", "low"].indexOf(b.severity),
    ),
    score,
    verdict,
    stats: {
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      bullets: bullets.length,
      hiddenChars,
    },
  };
}

/* ---------------- rendering helpers ---------------- */

export type Segment = { text: string; findingId?: string; invisible?: boolean };

export function buildSegments(text: string, findings: Finding[]): Segment[] {
  const marks: Span[] = [];
  for (const f of findings) for (const s of f.spans) marks.push({ ...s, findingId: f.id });
  marks.sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue;
    if (m.start > cursor) segments.push({ text: text.slice(cursor, m.start) });
    const raw = text.slice(m.start, m.end);
    segments.push({
      text: raw,
      findingId: m.findingId,
      invisible: !raw.trim() || /[\u200B-\u200D\uFEFF\u2060\u00AD\u202A-\u202E\u2066-\u2069\uE000-\uF8FF]/.test(raw),
    });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

export function cleanText(text: string) {
  let out = text;
  for (const { re } of INVISIBLES) {
    out = out.replace(new RegExp(re.source, "g"), (m) => (/[\u00A0\u2000-\u200A\u205F\u3000]/.test(m) ? " " : ""));
  }
  return out
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[ \t]+\n/g, "\n");
}
