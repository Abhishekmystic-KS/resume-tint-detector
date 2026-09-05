import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const Input = z.object({
  text: z.string().min(40).max(24000),
  findings: z.array(z.string()).max(30),
});

export type ReviewResult = {
  ok: boolean;
  markdown?: string;
  error?: string;
};

const SYSTEM = `You review software-engineering resumes for signs of unedited AI generation.

Ground truth you must respect:
- Applicant Tracking Systems (Workday, Greenhouse, Lever, iCIMS, Taleo) do NOT detect AI authorship. They parse text and match keywords.
- LLM "watermarks" are statistical token-selection biases. They are NOT hidden characters or metadata and cannot be read by any resume parser.
- The only things in a document that behave like a real hidden mark are invisible Unicode characters and file metadata.
- Real rejection causes: (1) layout/parsing failures, (2) human recruiters spotting raw AI prose in a 6-10 second scan.

Recruiter fingerprints of raw AI output: suspiciously round metrics, uniform bullet length, buzzword stacking, no specific tool/system/version names, semantic flatness across career eras, hallucinated tool stacks, uniform corporate tone.

Write a short, blunt review in Markdown with exactly these sections:
## Does it look AI-written?
One paragraph verdict, plainly stated.
## What gives it away
3-6 bullets, each quoting the exact phrase from the resume and saying why it reads as generated.
## Rewrite these lines
3-5 items. For each: the original line, then a rewritten version that adds precise metrics, named tools, and specific scope. Invent nothing the resume does not imply — use [bracketed placeholders] where the candidate must supply a real number or tool.
## One thing to fix first
A single sentence.

Never claim a watermark was detected in the prose. Be concrete. No preamble.`;

export const reviewResume = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<ReviewResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "AI review isn't configured for this app yet." };

    const gateway = createLovableAiGatewayProvider(key);

    try {
      const result = await generateText({
        model: gateway("google/gemini-3.7-flash"),
        system: SYSTEM,
        prompt: [
          data.findings.length
            ? `Automated scanner already flagged: ${data.findings.join("; ")}.`
            : "The automated scanner flagged nothing structural.",
          "",
          "RESUME TEXT:",
          data.text,
        ].join("\n"),
        maxRetries: 1,
      });
      return { ok: true, markdown: result.text };
    } catch (err) {
      const status = (err as { statusCode?: number; status?: number })?.statusCode ??
        (err as { status?: number })?.status;
      if (status === 429) return { ok: false, error: "Too many reviews at once. Wait a moment and try again." };
      if (status === 402) return { ok: false, error: "This app is out of AI credits. Add more in Lovable to re-enable the written review." };
      if (status === 403) return { ok: false, error: "AI review is disabled for this workspace." };
      return { ok: false, error: (err as Error)?.message ?? "The AI review failed." };
    }
  });
