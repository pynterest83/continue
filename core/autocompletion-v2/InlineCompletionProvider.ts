import { v4 as uuidv4 } from "uuid";
import { CompletionOptions, ContinueConfig, IDE, ILLM } from "..";
import { ContextRetrievalService } from "../autocomplete/context/ContextRetrievalService";
import { postprocessCompletion } from "../autocomplete/postprocessing";
import { shouldPrefilter } from "../autocomplete/prefiltering";
import { getAllSnippetsWithoutRace } from "../autocomplete/snippets";
import { renderPromptWithTokenLimit } from "../autocomplete/templating";
import { GetLspDefinitionsFunction } from "../autocomplete/types";
import { AutocompleteLoggingService } from "../autocomplete/util/AutocompleteLoggingService";
import { HelperVars } from "../autocomplete/util/HelperVars";
import { ConfigHandler } from "../config/ConfigHandler";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../util/parameters";
import { Debouncer } from "./Debouncer";
import { LRUCache } from "./LruCache";
import {
  AutocompleteInput,
  AutocompleteOutcome,
  CancellationToken,
  TabAutocompleteOptions,
} from "./types";

const DEFAULT_PREFETCH_AFTER = 1000;

interface PrefetchInfo {
  promise: Promise<AutocompleteOutcome | undefined>;
  outcome: AutocompleteOutcome;
}

export class InlineCompletionProvider {
  private lruResultCache: LRUCache;
  private loggingService = new AutocompleteLoggingService();
  private debouncer = new Debouncer();
  private config?: ContinueConfig;
  private autoCompletionOptions?: TabAutocompleteOptions;
  private ide: IDE;
  private prefetchInfo?: PrefetchInfo;
  private prefetchAfter?: number;
  private contextRetrievalService: ContextRetrievalService;
  private getDefinitionsFromLsp: GetLspDefinitionsFunction;

  constructor(
    lruResultCache: LRUCache,
    ide: IDE,
    configHandler: ConfigHandler,
    getDefinitionsFromLsp: GetLspDefinitionsFunction,
  ) {
    this.lruResultCache = lruResultCache;
    this.ide = ide;
    this.contextRetrievalService = new ContextRetrievalService(ide);
    this.getDefinitionsFromLsp = getDefinitionsFromLsp;

    configHandler
      .loadConfig()
      .then(({ config }) => config && this.setConfig(config))
      .catch(console.error);
    configHandler.onConfigUpdate(({ config }) => {
      if (config) {
        this.setConfig(config);
      }
    });
  }

  public async provideInlineCompletionItems(
    input: AutocompleteInput,
    token?: CancellationToken,
  ): Promise<AutocompleteOutcome | undefined> {
    if (!this.llm) {
      return undefined;
    }

    await this.debouncer.wait();

    // avoid spam enter pressing when delaying because of debouncer
    if (token?.isCancellationRequested) {
      return undefined;
    }

    try {
      const shouldUsePrefetch =
        this.prefetchInfo && this.shouldUsePrefetch(input, this.prefetchInfo);
      const outcome = shouldUsePrefetch
        ? await this.prefetchInfo?.promise
        : await this.getCompletion(
            input,
            this.llm,
            this.autoCompletionOptions!, // if llm existed, _autoCompletionOptions defined
          );

      this.prefetchInfo = undefined;

      if (token?.isCancellationRequested) {
        return undefined;
      }

      if (outcome !== undefined) {
        if (this.prefetchAfter) {
          setTimeout(() => {
            const promise = this.prefetchCompletion(
              input,
              outcome,
              this.llm!,
              this.autoCompletionOptions!,
            );
            this.prefetchInfo = {
              promise,
              outcome,
            };
          }, this.prefetchAfter);
        }
        return outcome;
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  setConfig(config: ContinueConfig): void {
    this.config = config;

    const llm = config.selectedModelByRole.autocomplete;
    if (llm) {
      this.autoCompletionOptions = {
        ...DEFAULT_AUTOCOMPLETE_OPTS,
        ...config.tabAutocompleteOptions,
        ...llm.autocompleteOptions,
      };
      this.debouncer.setDelayTime(this.autoCompletionOptions.debounceDelay);
      this.updatePrefetch(this.autoCompletionOptions);
    }
  }

  public cancel() {
    this.prefetchInfo = undefined;
    this.loggingService.cancel();
  }

  public accept(completionId: string) {
    this.loggingService.accept(completionId);
  }

  public markDisplayed(completionId: string, outcome: AutocompleteOutcome) {
    this.loggingService.markDisplayed(completionId, outcome);
  }

  private async prefetchCompletion(
    input: AutocompleteInput,
    outcome: AutocompleteOutcome,
    llm: ILLM,
    autoCompletionOptions: TabAutocompleteOptions,
  ): Promise<AutocompleteOutcome | undefined> {
    const [newDocument, newPosition] = input.document.insertContent(
      input.pos,
      outcome.completion,
    );

    const newInput: AutocompleteInput = {
      completionId: uuidv4(),
      filepath: input.filepath,
      pos: newPosition,
      document: newDocument,
      // HelperVars must see the speculative document, not the file on disk
      manuallyPassFileContents: newDocument.getText(),
      recentlyEditedRanges: input.recentlyEditedRanges,
      recentlyVisitedRanges: input.recentlyVisitedRanges,
      isUntitledFile: input.isUntitledFile,
    };

    const newOutcome = await this.getCompletion(
      newInput,
      llm,
      autoCompletionOptions,
    );

    return newOutcome;
  }

  private async getCompletion(
    input: AutocompleteInput,
    llm: ILLM,
    autoCompletionOptions: TabAutocompleteOptions,
  ): Promise<AutocompleteOutcome | undefined> {
    const startTime = new Date();

    const options = { ...autoCompletionOptions };
    if (llm.promptTemplates?.autocomplete) {
      options.template = llm.promptTemplates.autocomplete as string;
    }

    const helper = await HelperVars.create(input, options, llm.model, this.ide);

    if (await shouldPrefilter(helper, this.ide)) {
      return undefined;
    }

    const [snippetPayload, workspaceDirs] = await Promise.all([
      getAllSnippetsWithoutRace({
        helper,
        ide: this.ide,
        getDefinitionsFromLsp: this.getDefinitionsFromLsp,
        contextRetrievalService: this.contextRetrievalService,
      }),
      this.ide.getWorkspaceDirs(),
    ]);

    // Upstream rendering: per-model FIM template, snippets commented with the
    // file language's comment mark, stop tokens and token-budget pruning.
    const { prompt, prefix, suffix, completionOptions } =
      renderPromptWithTokenLimit({ snippetPayload, workspaceDirs, helper, llm });

    // Keyed by prefix: while the user types through a suggestion only the
    // prefix grows, so a cached completion can be resumed.
    let completion = this.getCachedCompletion(helper.prunedPrefix);
    const cacheHit = completion !== undefined;

    if (!cacheHit) {
      this.loggingService.cancel();
      const abortController = this.loggingService.createAbortController(
        input.completionId,
      );
      completion = await this.fetchCompletion(
        prompt,
        llm,
        completionOptions,
        abortController.signal,
      );

      if (options.transform) {
        completion = postprocessCompletion({
          completion,
          llm,
          prefix,
          suffix,
        });
      }

      if (completion) {
        this.updateCachedCompletion(helper.prunedPrefix, completion);
      }
    }

    if (completion) {
      const now = new Date();
      const uniqueId = await this.ide.getUniqueId();
      const gitRepo = ""; //await this.ide.getRepoName(dirname(input.filepath)); uncomment when fixing it? getRepoName is very slow in first request
      const outcome: AutocompleteOutcome = {
        time: now.getTime() - startTime.getTime(),
        modelName: llm.model,
        prefix,
        suffix,
        prompt,
        completion,
        modelProvider: llm.providerName,
        completionOptions: autoCompletionOptions,
        cacheHit,
        numLines: completion.split("\n").length,
        filepath: input.filepath,
        completionId: input.completionId,
        uniqueId,
        timestamp: now.toISOString(),
        gitRepo,
        ...autoCompletionOptions,
      };

      return outcome;
    }

    return undefined;
  }

  private get llm() {
    return this.config?.selectedModelByRole.autocomplete;
  }

  /**
   * Exact hit on the prefix, or the remainder of a completion cached for a
   * shorter prefix when the user has typed its first characters.
   */
  private getCachedCompletion(
    prefix: string,
    maxLookback?: number,
  ): string | undefined {
    maxLookback = Math.min(prefix.length, maxLookback ?? 100);
    const exact = this.lruResultCache.get(this.lruResultCache.getHash(prefix));
    if (exact !== undefined) {
      return exact;
    }

    for (let i = prefix.length - 1; i >= prefix.length - maxLookback; i--) {
      const typed = prefix.slice(i);
      const result = this.lruResultCache.get(
        this.lruResultCache.getHash(prefix.slice(0, i)),
      );
      if (result !== undefined && result.startsWith(typed)) {
        const rest = result.slice(typed.length);
        // Fully typed through: fetch a fresh completion instead.
        return rest ? rest : undefined;
      }
    }

    return undefined;
  }

  private updateCachedCompletion(prefix: string, value: string): void {
    const hashKey = this.lruResultCache.getHash(prefix);
    this.lruResultCache.put(hashKey, value);
  }

  private async fetchCompletion(
    prompt: string,
    llm: ILLM,
    completionOptions: Partial<CompletionOptions> | undefined,
    signal: AbortSignal,
  ) {
    let completion = "";
    for await (const chunk of llm.streamComplete(prompt, signal, {
      ...completionOptions,
      raw: true,
    })) {
      completion += chunk;
    }
    return completion;
  }

  private updatePrefetch(config: TabAutocompleteOptions): void {
    const prefetch = config.experimental_prefetch;
    if (Boolean(prefetch)) {
      if (typeof prefetch === "boolean") {
        this.prefetchAfter = DEFAULT_PREFETCH_AFTER;
      } else {
        this.prefetchAfter = prefetch;
      }
    } else {
      this.prefetchAfter = undefined;
    }
  }

  private shouldUsePrefetch(
    input: AutocompleteInput,
    prefetchInfo: PrefetchInfo,
  ): boolean {
    const offset = input.document.offsetAt(input.pos);
    const before = input.document.getText().slice(0, offset);
    return before.endsWith(prefetchInfo.outcome.completion);
  }
}
