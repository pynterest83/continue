import { HelperVars } from "../../autocomplete/util/HelperVars.js";
import { NEXT_EDIT_MODELS } from "../../llm/constants.js";
import { localPathOrUriToPath } from "../../util/pathToUri.js";
import { findUriInDirs } from "../../util/uri.js";
import { DocumentHistoryTracker } from "../DocumentHistoryTracker.js";
import {
  buildSweepPrompt,
  extractSweepCompletion,
  mapWindowToPrevious,
  SWEEP_MAX_RECENT_DIFFS,
  SWEEP_STOP_TOKENS,
  SWEEP_WINDOW_RADIUS,
  sweepWindow,
  unifiedDiffToSweepDiffs,
} from "../templating/sweep.js";
import { ModelSpecificContext, Prompt, PromptMetadata } from "../types.js";
import { BaseNextEditModelProvider } from "./BaseNextEditProvider.js";

/**
 * Next edit with Sweep Next-Edit and custom models fine-tuned on its format.
 * Base models: the prompt goes to the raw completions endpoint, there is no
 * chat template and no system prompt. The model rewrites a fixed window of
 * +-10 lines around the cursor, which is used as the editable region.
 */
export class SweepProvider extends BaseNextEditModelProvider {
  constructor(modelName: NEXT_EDIT_MODELS = NEXT_EDIT_MODELS.SWEEP) {
    super(modelName);
  }

  getSystemPrompt(): string {
    return "";
  }

  getWindowSize() {
    return { topMargin: SWEEP_WINDOW_RADIUS, bottomMargin: SWEEP_WINDOW_RADIUS };
  }

  usesRawCompletion(): boolean {
    return true;
  }

  getStopTokens(): string[] {
    return SWEEP_STOP_TOKENS;
  }

  // Autocomplete postprocessing (e.g. "rewrites the line above") would
  // reject legitimate window rewrites.
  shouldPostprocess(): boolean {
    return false;
  }

  extractCompletion(message: string): string {
    return extractSweepCompletion(message);
  }

  calculateEditableRegion(
    helper: HelperVars,
    _usingFullFileDiff: boolean,
  ): {
    editableRegionStartLine: number;
    editableRegionEndLine: number;
  } {
    // Always the fixed window: it is exactly what the model rewrites.
    const { startLine, endLine } = sweepWindow(
      helper.pos.line,
      helper.fileLines.length,
    );
    return { editableRegionStartLine: startLine, editableRegionEndLine: endLine };
  }

  buildPromptContext(context: ModelSpecificContext) {
    const { helper, editableRegionStartLine, editableRegionEndLine } = context;
    const currentLines = helper.fileLines;
    const current = currentLines
      .slice(editableRegionStartLine, editableRegionEndLine + 1)
      .join("\n");

    const previousContent = DocumentHistoryTracker.getInstance()
      .getMostRecentDocumentHistory(localPathOrUriToPath(helper.filepath));
    let original = current;
    if (previousContent !== null) {
      const previousLines = previousContent.split("\n");
      const { startLine, endLine } = mapWindowToPrevious(
        previousLines,
        currentLines,
        editableRegionStartLine,
        editableRegionEndLine,
      );
      original = previousLines.slice(startLine, endLine + 1).join("\n");
    }

    const recentDiffs = context.diffContext
      .flatMap((diff) => unifiedDiffToSweepDiffs(diff))
      .slice(-SWEEP_MAX_RECENT_DIFFS);

    return {
      filePath: findUriInDirs(helper.filepath, helper.workspaceUris)
        .relativePathOrBasename,
      original,
      current,
      recentDiffs,
    };
  }

  async generatePrompts(context: ModelSpecificContext): Promise<Prompt[]> {
    const prompt = buildSweepPrompt(this.buildPromptContext(context));
    return [
      { role: "system", content: this.getSystemPrompt() },
      { role: "user", content: prompt },
    ];
  }

  buildPromptMetadata(context: ModelSpecificContext): PromptMetadata {
    const promptCtx = this.buildPromptContext(context);
    return {
      prompt: { role: "user", content: buildSweepPrompt(promptCtx) },
      userEdits: context.diffContext.join("\n"),
      userExcerpts: promptCtx.current,
    };
  }
}
