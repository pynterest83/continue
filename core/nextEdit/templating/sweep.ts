/**
 * Prompt format of Sweep Next-Edit (sweepai/sweep-next-edit-1.5B), also used by
 * custom fine-tuned next-edit models ("next-edit-ft"). It must stay
 * byte-identical to the format the models were trained on:
 *
 *   <|file_sep|>{context_path}
 *   {context_content}
 *   <|file_sep|>{changed_path}.diff
 *   original:
 *   {before}
 *   updated:
 *   {after}
 *   <|file_sep|>original/{path}
 *   {window before the most recent change}
 *   <|file_sep|>current/{path}
 *   {current window}
 *   <|file_sep|>updated/{path}
 *
 * The model rewrites the current window and stops at the next <|file_sep|>.
 */

export const SWEEP_FILE_SEP = "<|file_sep|>";
export const SWEEP_STOP_TOKENS = [SWEEP_FILE_SEP, "<|endoftext|>", "</s>"];
/** Lines kept above and below the cursor in the rewritten window. */
export const SWEEP_WINDOW_RADIUS = 10;
/** Unchanged lines kept around each recent diff (matches training data). */
export const SWEEP_DIFF_CONTEXT_LINES = 2;
export const SWEEP_MAX_RECENT_DIFFS = 6;

export interface SweepRecentDiff {
  filePath: string;
  original: string;
  updated: string;
}

export function buildSweepPrompt(params: {
  filePath: string;
  original: string;
  current: string;
  recentDiffs?: SweepRecentDiff[];
  contextFiles?: { filePath: string; content: string }[];
}): string {
  const parts: string[] = [];
  for (const file of params.contextFiles ?? []) {
    parts.push(`${SWEEP_FILE_SEP}${file.filePath}`, file.content);
  }
  for (const diff of params.recentDiffs ?? []) {
    parts.push(
      `${SWEEP_FILE_SEP}${diff.filePath}.diff`,
      "original:",
      diff.original,
      "updated:",
      diff.updated,
    );
  }
  parts.push(
    `${SWEEP_FILE_SEP}original/${params.filePath}`,
    params.original,
    `${SWEEP_FILE_SEP}current/${params.filePath}`,
    params.current,
    `${SWEEP_FILE_SEP}updated/${params.filePath}`,
  );
  return parts.join("\n");
}

/** Model output -> rewritten window. */
export function extractSweepCompletion(text: string): string {
  let out = text.split(SWEEP_FILE_SEP, 1)[0];
  if (out.startsWith("\n")) {
    out = out.slice(1);
  }
  if (out.endsWith("\n")) {
    out = out.slice(0, -1);
  }
  return out;
}

/** Inclusive [start, end] line range of the window around the cursor. */
export function sweepWindow(
  cursorLine: number,
  lineCount: number,
  radius: number = SWEEP_WINDOW_RADIUS,
): { startLine: number; endLine: number } {
  return {
    startLine: Math.max(0, cursorLine - radius),
    endLine: Math.min(lineCount - 1, cursorLine + radius),
  };
}

/**
 * Map an inclusive window of `current` onto `previous` (the document before
 * the most recent change), treating everything between the common prefix and
 * common suffix as the changed region.
 */
export function mapWindowToPrevious(
  previous: string[],
  current: string[],
  startLine: number,
  endLine: number,
): { startLine: number; endLine: number } {
  const maxCommon = Math.min(previous.length, current.length);
  let prefix = 0;
  while (prefix < maxCommon && previous[prefix] === current[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < maxCommon - prefix &&
    previous[previous.length - 1 - suffix] ===
      current[current.length - 1 - suffix]
  ) {
    suffix++;
  }

  const delta = current.length - previous.length;
  const changedEndCur = current.length - suffix; // exclusive
  const changedEndPrev = previous.length - suffix; // exclusive
  const mapStart = (line: number) =>
    line <= prefix ? line : line >= changedEndCur ? line - delta : prefix;
  const mapEndExclusive = (line: number) =>
    line <= prefix ? line : line >= changedEndCur ? line - delta : changedEndPrev;

  return {
    startLine: mapStart(startLine),
    endLine: mapEndExclusive(endLine + 1) - 1,
  };
}

/**
 * Convert Continue's edit history (unified diffs from `createPatch`, one
 * "Index:" section per file) into original/updated blocks, one per hunk.
 */
export function unifiedDiffToSweepDiffs(
  diff: string,
  contextLines: number = SWEEP_DIFF_CONTEXT_LINES,
): SweepRecentDiff[] {
  const result: SweepRecentDiff[] = [];
  let filePath = "";
  let hunk: { type: " " | "-" | "+"; text: string }[] | undefined;

  const flush = () => {
    if (!hunk) {
      return;
    }
    const changed = hunk
      .map((l, i) => (l.type === " " ? -1 : i))
      .filter((i) => i >= 0);
    if (changed.length > 0) {
      const lines = hunk.slice(
        Math.max(0, changed[0] - contextLines),
        changed[changed.length - 1] + contextLines + 1,
      );
      result.push({
        filePath,
        original: lines
          .filter((l) => l.type !== "+")
          .map((l) => l.text)
          .join("\n"),
        updated: lines
          .filter((l) => l.type !== "-")
          .map((l) => l.text)
          .join("\n"),
      });
    }
    hunk = undefined;
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("Index: ")) {
      flush();
      filePath = line.slice("Index: ".length).trim();
    } else if (line.startsWith("@@")) {
      flush();
      hunk = [];
    } else if (line.startsWith("\\")) {
      continue; // "\ No newline at end of file"
    } else if (hunk && /^[ +-]/.test(line)) {
      // File headers (===, ---, +++) only appear before the first hunk, so
      // inside a hunk a "--- x" line is a removed "-- x" line.
      hunk.push({ type: line[0] as " " | "-" | "+", text: line.slice(1) });
    }
  }
  flush();
  return result;
}
