import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  LevelFormat,
  Header,
  Footer,
  PageNumber,
} from "docx";

type Section = { type: "heading" | "bullet" | "paragraph"; text: string; level: number };

function parseLines(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      sections.push({ type: "heading", text: headingMatch[2].trim(), level: headingMatch[1].length });
      continue;
    }

    const bulletMatch = trimmed.match(/^([-*••·◦▪‣])\s+(.*)$/);
    if (bulletMatch && bulletMatch[2]) {
      sections.push({ type: "bullet", text: bulletMatch[2].trim(), level: 0 });
      continue;
    }

    sections.push({ type: "paragraph", text: trimmed, level: 0 });
  }

  return sections;
}

function splitRuns(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g);
  const runs: TextRun[] = [];

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      if (inner) runs.push(new TextRun({ text: inner, bold: true }));
    } else if (part.startsWith("__") && part.endsWith("__")) {
      const inner = part.slice(2, -2);
      if (inner) runs.push(new TextRun({ text: inner, bold: true }));
    } else if (part.startsWith("`") && part.endsWith("`")) {
      const inner = part.slice(1, -1);
      if (inner) runs.push(new TextRun({ text: inner, font: "Courier New" }));
    } else {
      runs.push(new TextRun(part));
    }
  }

  return runs;
}

export async function generateResumeDocx(markdown: string): Promise<Uint8Array> {
  const sections = parseLines(markdown);
  const children: Paragraph[] = [];

  for (const section of sections) {
    if (section.type === "heading") {
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: section.text,
              bold: true,
              size: section.level === 1 ? 32 : 26,
              font: "Arial",
            }),
          ],
        }),
      );
    } else if (section.type === "bullet") {
      children.push(
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
          children: splitRuns(section.text),
        }),
      );
    } else {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: splitRuns(section.text),
        }),
      );
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: "Rewritten with Vermilion", size: 18, color: "666666" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 18, color: "666666" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "666666" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

export function downloadDocx(buffer: Uint8Array, fileName = "rewritten-resume.docx") {
  const slice = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const blob = new Blob([slice], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
