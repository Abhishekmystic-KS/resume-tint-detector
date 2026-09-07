import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { MATCH_SYSTEM, REWRITE_SYSTEM as SYSTEM, buildMatchPrompt, buildRewritePrompt } from "./review-prompt";

const Input = z.object({
  text: z.string().min(40).max(24000),
  findings: z.array(z.string()).max(30),
});

export type RewriteResult = {
  ok: boolean;
  markdown?: string;
  error?: string;
};

export const rewriteResume = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<RewriteResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "AI rewrite isn't configured for this app yet." };

    const gateway = createLovableAiGatewayProvider(key);

    try {
      const result = await generateText({
        model: gateway("google/gemini-3.7-flash"),
        system: SYSTEM,
        prompt: buildRewritePrompt(data.text, data.findings),
        maxRetries: 1,
      });
      return { ok: true, markdown: result.text };
    } catch (err) {
      const status = (err as { statusCode?: number; status?: number })?.statusCode ??
        (err as { status?: number })?.status;
      if (status === 429) return { ok: false, error: "Too many rewrites at once. Wait a moment and try again." };
      if (status === 402) return { ok: false, error: "This app is out of AI credits. Add more in Lovable to re-enable the resume rewrite." };
      if (status === 403) return { ok: false, error: "AI rewrite is disabled for this workspace." };
      return { ok: false, error: (err as Error)?.message ?? "The AI rewrite failed." };
    }
  });

const MatchInput = z.object({
  text: z.string().min(40).max(24000),
  jd: z.string().min(40).max(12000),
});

export const matchJob = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MatchInput.parse(data))
  .handler(async ({ data }): Promise<RewriteResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "AI review isn't configured for this app yet." };

    const gateway = createLovableAiGatewayProvider(key);

    try {
      const result = await generateText({
        model: gateway("google/gemini-3.7-flash"),
        system: MATCH_SYSTEM,
        prompt: buildMatchPrompt(data.text, data.jd),
        maxRetries: 1,
      });
      return { ok: true, markdown: result.text };
    } catch (err) {
      const status = (err as { statusCode?: number; status?: number })?.statusCode ??
        (err as { status?: number })?.status;
      if (status === 429) return { ok: false, error: "Too many requests at once. Wait a moment and try again." };
      if (status === 402) return { ok: false, error: "This app is out of AI credits. Add more in Lovable to re-enable this." };
      if (status === 403) return { ok: false, error: "AI features are disabled for this workspace." };
      return { ok: false, error: (err as Error)?.message ?? "The comparison failed." };
    }
  });
