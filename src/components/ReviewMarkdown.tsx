function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\])/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={i} className="font-semibold text-pale">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={i} className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[12px] text-pale">
          {p.slice(1, -1)}
        </code>
      );
    if (p.startsWith("[") && p.endsWith("]"))
      return (
        <span key={i} className="mark-flag px-1 text-pale">
          {p}
        </span>
      );
    return <span key={i}>{p}</span>;
  });
}

export function ReviewMarkdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = (key: string) => {
    if (!list.length) return;
    out.push(
      <ul key={key} className="mt-2 space-y-2">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-mute">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-high" />
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      list.push(line.replace(/^\s*([-*•]|\d+\.)\s+/, ""));
      return;
    }
    flush(`l${i}`);
    if (!line.trim()) return;
    if (/^#{2,3}\s/.test(line)) {
      out.push(
        <h3
          key={i}
          className="mt-7 font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-high first:mt-0"
        >
          {line.replace(/^#{2,3}\s/, "")}
        </h3>,
      );
      return;
    }
    if (/^#\s/.test(line)) {
      out.push(
        <h2 key={i} className="mt-7 font-display text-lg font-semibold text-pale first:mt-0">
          {line.replace(/^#\s/, "")}
        </h2>,
      );
      return;
    }
    out.push(
      <p key={i} className="mt-2.5 text-[13.5px] leading-relaxed text-mute">
        {inline(line)}
      </p>,
    );
  });
  flush("last");

  return <div>{out}</div>;
}
