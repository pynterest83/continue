import { InlineCompletionProvider } from "core/autocompletion-v2/InlineCompletionProvider";
import { LRUCache } from "core/autocompletion-v2/LruCache";
import { AutocompleteInput, TextDocument } from "core/autocompletion-v2/types";
import { ConfigHandler } from "core/config/ConfigHandler";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";

import { ContinueCompletionProvider } from "../autocomplete/completionProvider";
import { getDefinitionsFromLsp } from "../autocomplete/lsp";
import { RecentlyEditedTracker } from "../autocomplete/recentlyEdited";
import { RecentlyVisitedRangesService } from "../autocomplete/RecentlyVisitedRangesService";
import { getStatusBarStatus, StatusBarStatus } from "../autocomplete/statusBar";
import { VsCodeIde } from "../VsCodeIde";
import { VsCodeWebviewProtocol } from "../webviewProtocol";

/**
 * Inline completion provider for the autocomplete v2 engine.
 *
 * Autocomplete runs on the v2 engine (debounce, typing-through cache,
 * prefetch). Next edit is delegated to upstream's ContinueCompletionProvider,
 * which owns the whole next-edit pipeline (prefetch queue, jump manager,
 * window manager), so both features keep working side by side.
 */
export class AutocompleteV2Provider
  implements vscode.InlineCompletionItemProvider
{
  public recentlyEditedTracker: RecentlyEditedTracker;
  public recentlyVisitedRanges: RecentlyVisitedRangesService;
  private inlineCompletion: InlineCompletionProvider;
  private nextEdit: ContinueCompletionProvider;
  private isNextEditActive = false;

  constructor(
    configHandler: ConfigHandler,
    ide: VsCodeIde,
    webviewProtocol: VsCodeWebviewProtocol,
    usingFullFileDiff: boolean,
  ) {
    this.nextEdit = new ContinueCompletionProvider(
      configHandler,
      ide,
      webviewProtocol,
      usingFullFileDiff,
    );
    // Share the trackers so edits/visits are recorded once for both engines.
    this.recentlyEditedTracker = this.nextEdit.recentlyEditedTracker;
    this.recentlyVisitedRanges = this.nextEdit.recentlyVisitedRanges;
    this.inlineCompletion = new InlineCompletionProvider(
      new LRUCache(1000),
      ide,
      configHandler,
      getDefinitionsFromLsp,
    );
  }

  //@ts-ignore
  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<
    vscode.ProviderResult<
      vscode.InlineCompletionItem[] | vscode.InlineCompletionList
    >
  > {
    if (this.isNextEditActive) {
      return this.nextEdit.provideInlineCompletionItems(
        document,
        position,
        context,
        token,
      );
    }

    const enableTabAutocomplete =
      getStatusBarStatus() === StatusBarStatus.Enabled;

    if (token.isCancellationRequested || !enableTabAutocomplete) {
      return null;
    }

    const compatDocument = new TextDocument(
      document.getText(),
      document.languageId,
    );
    const input: AutocompleteInput = {
      document: compatDocument,
      pos: { line: position.line, character: position.character },
      completionId: uuidv4(),
      filepath: document.uri.toString(),
      isUntitledFile: document.isUntitled,
      // Use the live buffer (unsaved edits, untitled files), not the file on disk.
      manuallyPassFileContents: compatDocument.getText(),
      recentlyEditedRanges:
        await this.recentlyEditedTracker.getRecentlyEditedRanges(),
      recentlyVisitedRanges: this.recentlyVisitedRanges.getSnippets(),
    };
    const outcome = await this.inlineCompletion.provideInlineCompletionItems(
      input,
      token,
    );

    if (outcome?.completion) {
      this.inlineCompletion.markDisplayed(input.completionId, outcome);
      return [
        new vscode.InlineCompletionItem(
          outcome.completion,
          new vscode.Range(position, position),
          {
            title: "Log Autocomplete Outcome",
            command: "continue.logAutocompleteOutcome",
            arguments: [input.completionId, this.inlineCompletion],
          },
        ),
      ];
    }
    return [];
  }

  public updateUsingFullFileDiff(shouldUseFullFileDiff: boolean) {
    this.nextEdit.updateUsingFullFileDiff(shouldUseFullFileDiff);
  }

  public activateNextEdit() {
    this.isNextEditActive = true;
    this.nextEdit.activateNextEdit();
  }

  public deactivateNextEdit() {
    this.isNextEditActive = false;
    this.nextEdit.deactivateNextEdit();
  }
}
