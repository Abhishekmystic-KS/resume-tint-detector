import { buildReviewPrompt, REVIEW_SYSTEM } from "./review-prompt";

export const USER_KEY_STORAGE = "vermilion.gemini-key";
export const USER_MODEL = "gemini-2.5-flash";

export function loadUserKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(USER_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveUserKey(key: string) {
  try {
    if (key) window.localStorage.setItem(USER_KEY_STORAGE, key);
    else window.localStorage.removeItem(USER_KEY_STORAGE);
  } catch {
    /* storage blocked — key just won't persist */
  }
}

/**
 * Calls Google's Gemini API straight from the browser with a key the visitor
 * pasted in themselves. Nothing is sent to this app's server.
 */
export async function reviewWithUserKey(
  apiKey: string,
  text: string,
  findings: string[],
): Promise<{ ok: boolean; markdown?: string; error?: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${USER_MODEL}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: REVIEW_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: buildReviewPrompt(text, findings) }] }],
      }),
    });
  } catch {
    return { ok: false, error: "Couldn't reach Google. Check your connection and try again." };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const detail = body?.error?.message;
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: detail ?? "That key was rejected by Google. Check it and paste it again.",
      };
    }
    if (res.status === 429) {
      return { ok: false, error: "Your key hit Google's free rate limit. Wait a minute and retry." };
    }
    return { ok: false, error: detail ?? `Google returned an error (${res.status}).` };
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const markdown = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!markdown) return { ok: false, error: "Google returned an empty response. Try again." };
  return { ok: true, markdown };
}
