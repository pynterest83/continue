import { AutocompleteCodeSnippet } from "../autocomplete/snippets/types";
import { RecentlyEditedRange } from "../nextEdit/types";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../util/parameters";

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface AutocompleteInput {
  completionId: string;
  document: TextDocument;
  pos: Position;
  filepath: string;

  isUntitledFile: boolean;
  recentlyVisitedRanges: AutocompleteCodeSnippet[];
  recentlyEditedRanges: RecentlyEditedRange[];
  // Used for notebook files
  manuallyPassFileContents?: string;
  // Used for VS Code git commit input box
  manuallyPassPrefix?: string;
  selectedCompletionInfo?: {
    text: string;
    range: Range;
  };
  injectDetails?: string;
}

export class TextDocument {
  private lines: string[];
  public lineCount: number;

  constructor(
    private readonly content: string,
    public readonly languageId: string,
  ) {
    this.lines = content.split("\n");
    this.lineCount = this.lines.length;
  }

  public getText(range?: Range): string {
    if (!range) {
      return this.content;
    }

    const { start, end } = range;

    if (start.line === end.line) {
      return this.lines[start.line].slice(start.character, end.character);
    }

    const lines = [];

    lines.push(this.lines[start.line].slice(start.character));

    for (let i = start.line + 1; i < end.line; i++) {
      lines.push(this.lines[i]);
    }

    lines.push(this.lines[end.line].slice(0, end.character));

    return lines.join("\n");
  }

  public lineAt(line: number): string {
    return this.lines[line];
  }

  public offsetAt(position: Position): number {
    let { line, character } = position;

    if (line >= this.lineCount) {
      line = this.lineCount - 1;
      character = this.lines[line].length;
    }

    let offset = 0;

    for (let i = 0; i < line; i++) {
      offset += this.lines[i].length + 1; // +1 for '\n'
    }

    character = Math.min(character, this.lines[line].length);

    offset += character;
    return offset;
  }

  public insertContent(
    cursorPosition: Position,
    content: string,
  ): [TextDocument, Position] {
    const insertOffset = this.offsetAt(cursorPosition);

    const before = this.content.slice(0, insertOffset);
    const after = this.content.slice(insertOffset);
    const newContent = before + content + after;

    const insertedLines = content.split("\n");
    let newLine = cursorPosition.line + insertedLines.length - 1;

    let newChar: number;
    if (insertedLines.length === 1) {
      newChar = cursorPosition.character + insertedLines[0].length;
    } else {
      newChar = insertedLines[insertedLines.length - 1].length;
    }

    const newPosition: Position = { line: newLine, character: newChar };

    const newDoc = new TextDocument(newContent, this.languageId);

    return [newDoc, newPosition];
  }
}

export type TabAutocompleteOptions = typeof DEFAULT_AUTOCOMPLETE_OPTS;

export type { AutocompleteOutcome } from "../autocomplete/util/types";

export interface CancellationToken {
  isCancellationRequested: boolean;
}
