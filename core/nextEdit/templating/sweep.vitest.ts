import { describe, expect, test } from "vitest";
import {
  buildSweepPrompt,
  extractSweepCompletion,
  mapWindowToPrevious,
  sweepWindow,
  unifiedDiffToSweepDiffs,
} from "./sweep";

/** Logic of build_prompt() from sweepai/sweep-next-edit-1.5B run_model.py (Apache-2.0). */
function sweepReferencePrompt(
  contextFiles: Record<string, string>,
  recentDiffs: { file_path: string; original: string; updated: string }[],
  filePath: string,
  originalContent: string,
  currentContent: string,
): string {
  const parts: string[] = [];
  for (const [path, content] of Object.entries(contextFiles)) {
    parts.push(`<|file_sep|>${path}`, content);
  }
  for (const diff of recentDiffs) {
    parts.push(`<|file_sep|>${diff.file_path}.diff`, "original:", diff.original);
    parts.push("updated:", diff.updated);
  }
  parts.push(`<|file_sep|>original/${filePath}`, originalContent);
  parts.push(`<|file_sep|>current/${filePath}`, currentContent);
  parts.push(`<|file_sep|>updated/${filePath}`);
  return parts.join("\n");
}

describe("buildSweepPrompt", () => {
  test("matches Sweep's reference format byte for byte", () => {
    const context = { "utils.py": "def get_time_of_day():\n    return 'morning'\n" };
    const diffs = [
      {
        file_path: "greet.py",
        original: 'def greet():\n    print("Hello!")',
        updated: 'def greet(name):\n    print(f"Hello, {name}!")',
      },
    ];
    const original = 'def greet(name):\n    print(f"Hello, {name}!")\n\ngreet("Alice")';
    const current = "from utils import get_time_of_day\n\n" + original;

    const ours = buildSweepPrompt({
      filePath: "greet.py",
      original,
      current,
      recentDiffs: diffs.map((d) => ({
        filePath: d.file_path,
        original: d.original,
        updated: d.updated,
      })),
      contextFiles: Object.entries(context).map(([filePath, content]) => ({
        filePath,
        content,
      })),
    });
    expect(ours).toBe(
      sweepReferencePrompt(context, diffs, "greet.py", original, current),
    );
  });
});

describe("extractSweepCompletion", () => {
  test("strips the leading newline, trailing newline and stop token", () => {
    expect(extractSweepCompletion("\na = 1\nb = 2\n<|file_sep|>x")).toBe(
      "a = 1\nb = 2",
    );
    expect(extractSweepCompletion("\na = 1\n")).toBe("a = 1");
  });
});

describe("sweepWindow", () => {
  test("clamps to the file", () => {
    expect(sweepWindow(3, 100)).toEqual({ startLine: 0, endLine: 13 });
    expect(sweepWindow(95, 100)).toEqual({ startLine: 85, endLine: 99 });
  });
});

describe("mapWindowToPrevious", () => {
  const prev = Array.from({ length: 30 }, (_, i) => `l${i}`);

  test("identity when nothing changed", () => {
    expect(mapWindowToPrevious(prev, prev, 5, 15)).toEqual({
      startLine: 5,
      endLine: 15,
    });
  });

  test("shifts the end past an insertion", () => {
    const cur = [...prev.slice(0, 10), "new1", "new2", ...prev.slice(10)];
    // window 2..20 in cur ends after the insertion -> 2..18 in prev
    expect(mapWindowToPrevious(prev, cur, 2, 20)).toEqual({
      startLine: 2,
      endLine: 18,
    });
  });
});

describe("unifiedDiffToSweepDiffs", () => {
  test("converts createPatch output into original/updated blocks", () => {
    const diff = [
      "Index: src/app.py",
      "===================================================================",
      "--- src/app.py",
      "+++ src/app.py",
      "@@ -1,7 +1,7 @@",
      " a",
      " b",
      " c",
      "-old",
      "+new",
      " d",
      " e",
      " f",
      "\\ No newline at end of file",
      "",
    ].join("\n");
    expect(unifiedDiffToSweepDiffs(diff)).toEqual([
      {
        filePath: "src/app.py",
        original: "b\nc\nold\nd\ne",
        updated: "b\nc\nnew\nd\ne",
      },
    ]);
  });

  test("a removed '-- comment' line is not mistaken for a file header", () => {
    const diff = [
      "Index: q.sql",
      "--- q.sql",
      "+++ q.sql",
      "@@ -1,2 +1,1 @@",
      "--- old comment",
      " SELECT 1;",
    ].join("\n");
    expect(unifiedDiffToSweepDiffs(diff)).toEqual([
      { filePath: "q.sql", original: "-- old comment\nSELECT 1;", updated: "SELECT 1;" },
    ]);
  });
});
