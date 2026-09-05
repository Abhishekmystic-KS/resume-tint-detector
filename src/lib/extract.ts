import type { DocMeta } from "./detect";

export type Extracted = { text: string; meta: DocMeta };

async function extractPdf(file: File): Promise<Extracted> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) text += "\n";
      text += item.str;
      if (item.hasEOL) text += "\n";
      if (y !== undefined) lastY = y;
    }
    text += "\n\n";
  }

  let info: Record<string, unknown> = {};
  try {
    const md = await doc.getMetadata();
    info = (md.info ?? {}) as Record<string, unknown>;
  } catch {
    /* metadata is optional */
  }

  return {
    text: text.replace(/\n{3,}/g, "\n\n").trim(),
    meta: {
      fileName: file.name,
      pages: doc.numPages,
      producer: String(info['Producer'] ?? ""),
      creator: String(info['Creator'] ?? ""),
      title: String(info['Title'] ?? ""),
      author: String(info['Author'] ?? ""),
    },
  };
}

async function extractDocx(file: File): Promise<Extracted> {
  const mammoth = (await import("mammoth/mammoth.browser"));
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return { text: res.value.trim(), meta: { fileName: file.name } };
}

export async function extractFile(file: File): Promise<Extracted> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return { text: (await file.text()).trim(), meta: { fileName: file.name } };
  }
  throw new Error("Unsupported file. Use a PDF, DOCX, or TXT resume.");
}
