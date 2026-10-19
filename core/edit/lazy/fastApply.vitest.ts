import { describe, expect, test } from "vitest";
import {
  buildFastApplyMessages,
  FAST_APPLY_SYSTEM_PROMPT,
  isFastApplyModel,
  parseFastApplyOutput,
} from "./fastApply";

describe("fastApply prompt", () => {
  test("system prompt matches the training format", () => {
    expect(FAST_APPLY_SYSTEM_PROMPT).toBe(
      "Merge the <update> snippet into the <code>. Lines saying '... existing code ...' stand for unchanged code. Output the complete updated file inside <updated-code> tags and change nothing else.",
    );
  });

  test("user message layout", () => {
    const [, user] = buildFastApplyMessages("a = 1\n", "# ... existing code ...\nb = 2");
    expect(user.content).toBe(
      "<code>\na = 1\n\n</code>\n<update>\n# ... existing code ...\nb = 2\n</update>",
    );
  });

  test("parses the rewritten file and keeps its final newline", () => {
    expect(parseFastApplyOutput("<updated-code>\na = 1\nb = 2\n\n</updated-code>")).toBe(
      "a = 1\nb = 2\n",
    );
    expect(parseFastApplyOutput("<updated-code>\na = 1\n")).toBeUndefined();
  });

  test("model detection", () => {
    expect(isFastApplyModel("fast-apply-ft-1.5b")).toBe(true);
    expect(isFastApplyModel("Qwen/Qwen2.5-Coder-1.5B")).toBe(false);
  });
});
