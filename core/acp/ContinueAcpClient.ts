import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";

import * as acp from "@agentclientprotocol/sdk";
import { ChatMessage, IDE } from "../index.js";
import { IMessenger } from "../protocol/messenger/index.js";
import { ToWebviewFromIdeOrCoreProtocol } from "../protocol/webview.js";

export class ContinueAcpClient implements acp.Client {
  private _connection: acp.ClientSideConnection | null = null;

  constructor(
    private ide: IDE,
    private messenger: IMessenger<any, ToWebviewFromIdeOrCoreProtocol>,
    private agentId: string,
    private mode?: string,
  ) {}

  private fileToStreamId: Map<string, string> = new Map();

  setConnection(connection: acp.ClientSideConnection) {
    this._connection = connection;
  }

  async sessionUpdate(notification: acp.SessionNotification): Promise<void> {
    console.log(notification.update.sessionUpdate, notification);

    const update = notification.update;
    let messages: ChatMessage[] = [];

    if (!update) return;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        messages = this.handleAgentMessageChunk(update);
        break;
      case "tool_call":
        messages = await this.handleToolCall(update);
        break;
      case "tool_call_update":
        messages = await this.handleToolCallUpdate(update);
        break;
      case "plan":
        messages = this.handlePlan(update);
        break;
      case "user_message_chunk":
        messages = this.handleUserMessageChunk(update);
        break;
      case "agent_thought_chunk":
        messages = this.handleAgentThoughtChunk(update);
        break;
      case "available_commands_update":
        messages = this.handleAvailableCommandsUpdate(update);
        break;
      case "current_mode_update":
        messages = this.handleCurrentModeUpdate(update);
        break;
      case "config_option_update":
        messages = this.handleConfigOptionUpdate(update);
        break;
      case "session_info_update":
        messages = this.handleSessionInfoUpdate(update);
        break;
    }

    if (messages.length > 0) {
      this.messenger.send("acp/streamUpdate", messages);
    }
  }

  private handleAgentMessageChunk(
    update: Extract<
      acp.SessionUpdate,
      { sessionUpdate: "agent_message_chunk" }
    >,
  ): ChatMessage[] {
    if (update.content?.type === "text") {
      return [
        {
          role: "assistant",
          content: update.content.text,
        },
      ];
    }
    return [];
  }

  private async handleToolCall(
    update: Extract<acp.SessionUpdate, { sessionUpdate: "tool_call" }>,
  ): Promise<ChatMessage[]> {
    return [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: update.toolCallId,
            type: "function",
            function: {
              name: update.title,
              arguments: JSON.stringify(update.rawInput || {}),
            },
          },
        ],
        metadata: {
          acpToolCallId: update.toolCallId,
          acpToolKind: update.kind,
          acpToolStatus: update.status,
        },
      },
    ];
  }

  private async handleToolCallUpdate(
    update: Extract<acp.SessionUpdate, { sessionUpdate: "tool_call_update" }>,
  ): Promise<ChatMessage[]> {
    return [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: update.toolCallId,
            type: "function",
            function: {
              name: update.title ?? "",
              arguments: JSON.stringify(update.rawInput || {}),
            },
          },
        ],
        metadata: {
          acpToolCallId: update.toolCallId,
          acpToolKind: update.kind,
          acpToolStatus: update.status,
        },
      },
    ];
  }

  private handlePlan(
    update: Extract<acp.SessionUpdate, { sessionUpdate: "plan" }>,
  ): ChatMessage[] {
    this.messenger.send("acp/planUpdate", update);
    return [];
  }

  private handleUserMessageChunk(
    update: Extract<acp.SessionUpdate, { sessionUpdate: "user_message_chunk" }>,
  ): ChatMessage[] {
    // TODO: Handle user message chunks
    return [];
  }

  private handleAgentThoughtChunk(
    update: Extract<
      acp.SessionUpdate,
      { sessionUpdate: "agent_thought_chunk" }
    >,
  ): ChatMessage[] {
    if (update.content?.type === "text") {
      return [
        {
          role: "thinking",
          content: update.content.text,
        },
      ];
    }
    return [];
  }

  private handleAvailableCommandsUpdate(
    update: Extract<
      acp.SessionUpdate,
      { sessionUpdate: "available_commands_update" }
    >,
  ): ChatMessage[] {
    // TODO: Handle available commands update
    return [];
  }

  private handleCurrentModeUpdate(
    update: Extract<
      acp.SessionUpdate,
      { sessionUpdate: "current_mode_update" }
    >,
  ): ChatMessage[] {
    console.log("ContinueAcpClient handleCurrentModeUpdate", update);
    this.messenger.send("acp/currentModeUpdate", {
      mode: update.currentModeId,
    });
    return [];
  }

  private handleConfigOptionUpdate(
    update: Extract<
      acp.SessionUpdate,
      { sessionUpdate: "config_option_update" }
    >,
  ): ChatMessage[] {
    // TODO: Handle config option update
    return [];
  }

  private handleSessionInfoUpdate(
    update: Extract<
      acp.SessionUpdate,
      { sessionUpdate: "session_info_update" }
    >,
  ): ChatMessage[] {
    // TODO: Handle session info update
    return [];
  }

  async readTextFile(
    params: acp.ReadTextFileRequest,
  ): Promise<acp.ReadTextFileResponse> {
    console.log("ContinueAcpClient readTextFile", params.path);
    try {
      const uri =
        !params.path.startsWith("file://") && nodePath.isAbsolute(params.path)
          ? pathToFileURL(params.path).toString()
          : params.path;
      const content = await this.ide.readFile(uri);
      return { content };
    } catch (error: any) {
      throw new acp.RequestError(
        -32603,
        `Failed to read file: ${error.message}`,
      );
    }
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest,
  ): Promise<acp.WriteTextFileResponse> {
    console.log("ContinueAcpClient writeTextFile", params.path);
    try {
      await this.performApplyToFile(params.path, params.content);
      return {};
    } catch (error: any) {
      console.error("ContinueAcpClient writeTextFile error", error);
      throw new acp.RequestError(
        -32603,
        `Failed to initiate file write: ${error.message}`,
      );
    }
  }

  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    console.log("ContinueAcpClient requestPermission", params);
    try {
      const response = await this.messenger.request(
        "acp/requestPermission",
        params,
      );
      return response;
    } catch (error: any) {
      console.error("ContinueAcpClient requestPermission error", error);
      return {
        outcome: {
          outcome: "cancelled",
        },
      };
    }
  }

  private async performApplyToFile(
    path: string,
    content: string,
  ): Promise<void> {
    const workspaceDirs = await this.ide.getWorkspaceDirs();
    let filepath = path;

    if (filepath.startsWith("file://")) {
      // already a URI
    } else if (nodePath.isAbsolute(filepath)) {
      filepath = pathToFileURL(filepath).toString();
    } else if (workspaceDirs.length > 0) {
      const workspaceDir = workspaceDirs[0];
      const baseUrl = workspaceDir.endsWith("/")
        ? workspaceDir
        : workspaceDir + "/";
      try {
        filepath = new URL(path, baseUrl).toString();
      } catch (e) {
        console.warn("Failed to resolve path using URL, falling back", e);
        // Fallback if URL resolution fails
        filepath = baseUrl + path;
      }
    }

    let streamId = this.fileToStreamId.get(filepath);
    if (!streamId) {
      streamId = await this.ide.getUniqueId();
      this.fileToStreamId.set(filepath, streamId);
    }

    this.messenger.send("applyToFile", {
      streamId,
      filepath,
      text: content,
    });
  }
}
