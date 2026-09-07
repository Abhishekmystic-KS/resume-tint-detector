# Plan: Full resume rewrite with DOCX download

## What we are building
Replace the current "Line-by-line rewrite" section with a single "Rewrite my resume" action. The AI returns a complete, rewritten resume that keeps the original structure but removes AI fingerprints, generic phrasing, and suspiciously round metrics. The result is shown in a copyable panel and can be downloaded as a `.docx` file.

## Why this change
The user wants the app to hand back a ready-to-use resume, not just point out weak lines.

## User-facing changes
1. Replace the "Line-by-line rewrite" heading and "Get the rewrite" button with "Rewrite my resume" and "Generate rewrite".
2. After generation, show the rewritten resume in a scrollable panel.
3. Add two actions above the panel: **Copy** and **Download as DOCX**.
4. Keep the existing "Use my own Gemini key" toggle; it now powers the full rewrite instead of the line-by-line review.
5. Remove the old review output UI and the separate job-match section remains unchanged.

## Technical work

### 1. New rewrite prompt
- Add `REWRITE_SYSTEM` and `buildRewritePrompt(text, findings)` to `src/lib/review-prompt.ts`.
- The prompt instructs the model to return a complete rewritten resume in Markdown-ish plain text, preserving sections (Contact/Summary/Experience/Education/Skills) and fixing flagged issues.
- Rules to embed: no invented facts, use `[bracketed placeholders]` where the user must supply real numbers/tools, keep the same approximate length, remove buzzwords and generic phrases.

### 2. Server function
- Add `rewriteResume` in `src/lib/review.functions.ts` (same shape as `reviewResume`, uses new prompt, input `text` + `findings`).
- Reuse the Lovable AI Gateway and `google/gemini-3.7-flash` model.
- Map gateway errors the same way (429, 402, 403).

### 3. Browser-side Gemini path
- Add `rewriteWithUserKey(apiKey, text, findings)` in `src/lib/user-gemini.ts`.
- Mirrors `reviewWithUserKey` but uses `REWRITE_SYSTEM` + `buildRewritePrompt`.

### 4. DOCX generation
- Install `docx`.
- Create `src/lib/to-docx.ts` with a function `generateResumeDocx(markdown: string): Promise<Uint8Array>`.
- Parse the rewritten text into paragraphs and bullet lists; render headings as bold paragraphs.
- Use US Letter page size, 1-inch margins, Arial default, no unicode bullets (use `LevelFormat.BULLET`).
- Validate the generated DOCX before returning it.

### 5. UI update in `src/routes/index.tsx`
- Remove `review`/`reviewing` state and the old review rendering.
- Add `rewrite`/`rewriting` state and `askRewrite` callback.
- Replace the old review section markup with the new rewrite section.
- Wire the "Download as DOCX" button to call `generateResumeDocx` and trigger a browser download.
- Keep the job-match section below untouched.

### 6. Clean-up
- Remove the now-unused `ReviewMarkdown` component import if it is no longer used anywhere else.
- Remove `REVIEW_SYSTEM` and `buildReviewPrompt` only if confirmed unused after the rewrite; otherwise leave them for safety.

## Verification
- Run the dev build.
- Use Playwright to paste a sample resume, click "Generate rewrite", and verify the panel appears with a full resume and both Copy/Download buttons.
- Download the DOCX and validate it opens correctly.

## Out of scope
- Tracking changes inside the DOCX.
- Preserving exact formatting from the original PDF/DOCX upload.
- Multiple rewrite styles or tone options.
