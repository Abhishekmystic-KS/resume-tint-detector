import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { REVIEW_SYSTEM as SYSTEM, buildReviewPrompt } from "./review-prompt";

const Input = z.object({
  text: z.string().min(40).max(24000),
  findings: z.array(z.string()).max(30),
});

export type ReviewResult = {
  ok: boolean;
  markdown?: string;
  error?: string;
};


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
        prompt: buildReviewPrompt(data.text, data.findings),
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
