import * as acp from "@agentclientprotocol/sdk";
import { ConfigResult } from "@continuedev/config-yaml";
import type {
  BrowserSerializedContinueConfig,
  ChatMessage,
  ContextItemWithId,
  ContextProviderName,
  IndexingProgressUpdate,
  IndexingStatus,
} from "../index.js";
import type { ProfileDescription } from "../config/ProfileLifecycleManager.js";

export type ToWebviewFromIdeOrCoreProtocol = {
  configUpdate: [
    {
      result: ConfigResult<BrowserSerializedContinueConfig>;
      profileId: string | null;
      profiles: ProfileDescription[];
    },
    void,
  ];
  getDefaultModelTitle: [undefined, string | undefined];
  indexProgress: [IndexingProgressUpdate, void]; // Codebase
  "indexing/statusUpdate": [IndexingStatus, void]; // Docs, etc.
  refreshSubmenuItems: [
    {
      providers: "all" | "dependsOnIndexing" | ContextProviderName[];
    },
    void,
  ];
  didCloseFiles: [{ uris: string[] }, void];
  isContinueInputFocused: [undefined, boolean];
  addContextItem: [
    {
      historyIndex: number;
      item: ContextItemWithId;
    },
    void,
  ];
  setTTSActive: [boolean, void];
  getWebviewHistoryLength: [undefined, number];
  getCurrentSessionId: [undefined, string];
  "jetbrains/setColors": [Record<string, string | null | undefined>, void];
  sessionUpdate: [{ sessionInfo: any | undefined }, void];
  toolCallPartialOutput: [{ toolCallId: string; contextItems: any[] }, void];
  "acp/streamUpdate": [ChatMessage[], void];
  "acp/requestPermission": [
    acp.RequestPermissionRequest,
    acp.RequestPermissionResponse,
  ];
  "acp/currentModeUpdate": [{ mode: string }, void];
  "acp/availableModesUpdate": [
    { modes: { id: string; name?: string }[] },
    void,
  ];
  "acp/availableModelsUpdate": [
    { models: { modelId: string; name?: string }[] },
    void,
  ];
  "acp/currentModelUpdate": [{ modelId: string }, void];
  "acp/planUpdate": [acp.Plan, void];
};
