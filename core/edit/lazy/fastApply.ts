import { ChatMessage, DiffLine, ILLM } from "../../index.js";
import { myersDiff } from "../../diff/myers.js";
import { countTokens } from "../../llm/countTokens.js";

/**
 * Fast Apply: a small model fine-tuned to merge a lazy edit snippet
 * (unchanged code elided with "... existing code ...") into the file and
 * return the whole rewritten file.
 *
 * The prompt must stay identical to the format the model was trained on.
 */
export const FAST_APPLY_LAZY_MARKER_TEXT = "... existing code ...";

export const FAST_APPLY_SYSTEM_PROMPT =
  "Merge the <update> snippet into the <code>. Lines saying " +
  `'${FAST_APPLY_LAZY_MARKER_TEXT}' stand for unchanged code. Output the complete ` +
  "updated file inside <updated-code> tags and change nothing else.";

/** Substrings of model names served with the fast-apply format. */
const FAST_APPLY_MODELS = ["fast-apply-ft"];

const UPDATED_CODE_RE = /<updated-code>\n?([\s\S]*?)\n?<\/updated-code>/;

export function isFastApplyModel(model: string): boolean {
  const lower = model.toLowerCase();
  return FAST_APPLY_MODELS.some((name) => lower.includes(name));
}

export function buildFastApplyMessages(
  originalCode: string,
  updateSnippet: string,
): ChatMessage[] {
  return [
    { role: "system", content: FAST_APPLY_SYSTEM_PROMPT },
    {
      role: "user",
      content: `<code>\n${originalCode}\n</code>\n<update>\n${updateSnippet}\n</update>`,
    },
  ];
}

/** The rewritten file, or undefined if the output is incomplete (e.g. hit maxTokens). */
export function parseFastApplyOutput(text: string): string | undefined {
  return UPDATED_CODE_RE.exec(text)?.[1];
}

export async function fastApplyLazyEdit(
  oldFile: string,
  newLazyFile: string,
  llm: ILLM,
  signal: AbortSignal,
): Promise<DiffLine[] | undefined> {
  // The model was trained on "\n" line endings.
  const eol = oldFile.includes("\r\n") ? "\r\n" : "\n";
  const original = oldFile.replace(/\r\n/g, "\n");
  const update = newLazyFile.replace(/\r\n/g, "\n");

  // The output is roughly the size of the file plus the added code.
  const maxTokens =
    Math.ceil(countTokens(original + update, llm.model) * 1.2) + 256;

  const response = await llm.chat(
    buildFastApplyMessages(original, update),
    signal,
    { temperature: 0, maxTokens },
  );
  if (typeof response.content !== "string") {
    return undefined;
  }

  const updated = parseFastApplyOutput(response.content);
  if (updated === undefined) {
    return undefined;
  }
  return myersDiff(oldFile, updated.replace(/\n/g, eol));
}
