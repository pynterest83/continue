import { fileURLToPath } from "node:url";
import * as acp from "@agentclientprotocol/sdk";
import { ChildProcess, spawn } from "child_process";
import { Readable, Writable } from "stream";
import { ConfigHandler } from "../config/ConfigHandler.js";
import { IDE } from "../index.js";
import { IMessenger } from "../protocol/messenger/index.js";
import { ToWebviewFromIdeOrCoreProtocol } from "../protocol/webview.js";
import { ContinueAcpClient } from "./ContinueAcpClient.js";

interface AcpAgentMode {
  mode: string;
  tools: Record<string, boolean | "ask">;
}

interface AcpAgentMetadata {
  command: string;
  args: string[];
  defaultModes: Record<string, AcpAgentMode>;
  env?: Record<string, string>;
  allowSelectModel?: boolean;
}

const AGENT_PROVIDERS: Record<string, Partial<AcpAgentMetadata>> = {
  opencode: {
    command: "opencode",
    args: ["acp"],
    defaultModes: {},
    allowSelectModel: false,
  },
  gemini: {
    command: "gemini",
    args: ["--experimental-acp"],
    defaultModes: {},
    allowSelectModel: true,
  },
  qwen: {
    command: "qwen",
    args: ["--acp"],
    defaultModes: {},
    allowSelectModel: true,
  },
};

export class AcpService {
  private connections = new Map<string, acp.ClientSideConnection>();
  private clients = new Map<string, ContinueAcpClient>();
  private activeAgentId?: string;
  private activeSessionIds = new Map<string, string>();
  private processes = new Map<string, ChildProcess>();
  private activeModels = new Map<string, string | undefined>();
  private agentConfigs = new Map<
    string,
    { models: string[]; modes: Record<string, AcpAgentMode> }
  >();
  private connectionPromises = new Map<
    string,
    Promise<{
      success: boolean;
      error?: string;
      models?: { modelId: string; name?: string }[];
      modes?: { id: string; name?: string }[];
    }>
  >();

  constructor(
    private ide: IDE,
    private messenger: IMessenger<any, ToWebviewFromIdeOrCoreProtocol>,
    private configHandler: ConfigHandler,
  ) {}

  private async getAgentMetadata(
    agentId: string,
  ): Promise<AcpAgentMetadata | undefined> {
    const config = (await this.configHandler.loadConfig()).config;
    if (!config) return undefined;
    const agentConfig = config.agent_servers?.find(
      (a) => a.provider === agentId || a.name === agentId,
    );
    const providerDefaults =
      AGENT_PROVIDERS[agentConfig?.provider || agentId] || {};

    if (!agentConfig && !providerDefaults.command) {
      return undefined;
    }

    return {
      command: agentConfig?.command || providerDefaults.command || agentId,
      args: agentConfig?.args || providerDefaults.args || ["acp"],
      env: {
        ...providerDefaults.env,
        ...agentConfig?.env,
      },
      defaultModes: providerDefaults.defaultModes || {},
      allowSelectModel:
        agentConfig?.allowSelectModel ?? providerDefaults.allowSelectModel,
    };
  }

  async connect(
    agentId: string,
    mode?: string,
    model?: string,
    conversationId?: string,
  ): Promise<any> {
    // Check if there's already a connection attempt in progress for this agentId
    const existingPromise = this.connectionPromises.get(agentId);
    if (existingPromise) {
      return existingPromise;
    }

    const connectionPromise = this._connect(
      agentId,
      mode,
      model,
      conversationId,
    );
    this.connectionPromises.set(agentId, connectionPromise);

    try {
      return await connectionPromise;
    } finally {
      this.connectionPromises.delete(agentId);
    }
  }

  private async _connect(
    agentId: string,
    mode?: string,
    model?: string,
    conversationId?: string,
  ): Promise<any> {
    try {
      const registry = await this.getAgentMetadata(agentId);
      if (!registry) {
        throw new Error(`Agent ${agentId} not found in configuration`);
      }

      const existingConnection = this.connections.get(agentId);
      const lastModel = this.activeModels.get(agentId);

      // If already connected with same model, just return
      if (existingConnection && lastModel === model) {
        this.activeAgentId = agentId;

        // Ensure session exists for this conversation and set mode
        const { availableModes, availableModels } = await this.ensureSession(
          agentId,
          conversationId,
          mode,
        );

        return {
          success: true,
          models: availableModels,
          modes: availableModes,
          allowSelectModel: registry.allowSelectModel,
        };
      }

      // Cleanup existing if any
      const existingProcess = this.processes.get(agentId);
      if (existingProcess) {
        existingProcess.kill();
        this.processes.delete(agentId);
      }

      if (this.connections.has(agentId)) {
        this.connections.delete(agentId);
        this.clients.delete(agentId);
      }

      const workspaceDirs = await this.ide.getWorkspaceDirs();
      let cwd = workspaceDirs[0] || process.cwd();
      if (cwd.startsWith("file://")) {
        cwd = fileURLToPath(cwd);
      }

      const args = [...registry.args];

      const child = spawn(registry.command, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"], // Use pipe for stderr to capture logs
        shell: false,
        env: {
          ...process.env,
          ...((registry as any).env || {}),
        },
      });

      child.stderr?.on("data", (data) => {
        console.error(`ACP Agent [${agentId}] stderr: ${data.toString()}`);
      });

      child.on("error", (err) => {
        console.error(`ACP Agent [${agentId}] spawn error:`, err);
        this.processes.delete(agentId);
      });

      child.on("exit", (code, signal) => {
        console.log(
          `ACP Agent [${agentId}] exited with code ${code} and signal ${signal}`,
        );
        this.connections.delete(agentId);
        this.clients.delete(agentId);
        this.processes.delete(agentId);
      });

      this.processes.set(agentId, child);

      // output is where we SEND messages (stdin), input is where we RECEIVE (stdout)
      const stdin = child.stdin;
      const stdout = child.stdout;

      if (!stdin || !stdout) {
        throw new Error("Failed to initialize pipes for ACP agent");
      }

      const stream = acp.ndJsonStream(
        (Writable as any).toWeb(stdin) as any,
        (Readable as any).toWeb(stdout) as any,
      );

      const client = new ContinueAcpClient(
        this.ide,
        this.messenger,
        agentId,
        mode,
      );
      const connection = new acp.ClientSideConnection(() => client, stream);
      client.setConnection(connection);

      // Handshake with timeout
      const initPromise = connection.initialize({
        protocolVersion: 1,
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
        },
        clientInfo: {
          name: "Continue",
          version: "0.1.0",
        },
      });

      const timeout = (ms: number, msg: string) =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(msg)), ms),
        );

      const exitPromise = new Promise((_, reject) => {
        child.on("exit", (code) => {
          reject(
            new Error(
              `ACP agent ${agentId} exited with code ${code} during handshake`,
            ),
          );
        });
        child.on("error", (err) => {
          reject(
            new Error(
              `ACP agent ${agentId} error during handshake: ${err.message}`,
            ),
          );
        });
      });

      const a = await Promise.race([
        initPromise,
        exitPromise,
        timeout(15000, `Handshake timeout with agent ${agentId} after 15s`),
      ]);

      this.connections.set(agentId, connection);
      this.clients.set(agentId, client);
      this.activeModels.set(agentId, model);
      const sessionResponse = await this._newSession(agentId, conversationId);

      this.activeAgentId = agentId;
      this.activeSessionIds.set(
        this.getSessionKey(agentId, conversationId),
        sessionResponse.sessionId,
      );

      // Extract models from newSession response
      const availableModels = (
        sessionResponse.models?.availableModels || []
      ).map((m: any) => ({
        modelId: m.modelId || m,
        name: m.name || m.modelId || m,
      }));

      const currentModelId = sessionResponse.models?.currentModelId;

      // Extract modes from newSession response
      const availableModes = (sessionResponse.modes?.availableModes || []).map(
        (m: any) => ({
          id: m.id || m,
          name: m.name || m.id || m,
        }),
      );

      // Send models update to UI
      this.messenger.send("acp/availableModelsUpdate", {
        models: availableModels,
      });

      // Send current model update to UI if available
      if (currentModelId) {
        this.messenger.send("acp/currentModelUpdate", {
          modelId: currentModelId,
        });
      }

      if (mode && availableModes.find((m: any) => m.id === mode)) {
        await connection.setSessionMode({
          sessionId: sessionResponse.sessionId,
          modeId: mode,
        });
      }

      return {
        success: true,
        models: availableModels,
        modes: availableModes,
        allowSelectModel: registry.allowSelectModel,
      };
    } catch (error: any) {
      console.error(`Failed to connect to ACP agent ${agentId}:`, error);
      return { success: false, error: error.message };
    }
  }

  private async ensureSession(
    agentId?: string,
    conversationId?: string,
    mode?: string,
  ): Promise<{
    connection: acp.ClientSideConnection;
    sessionId: string;
    availableModes: { id: string; name?: string }[];
    availableModels: { modelId: string; name?: string }[];
  }> {
    const targetAgentId = agentId || this.activeAgentId;
    if (!targetAgentId) {
      throw new Error("No active ACP agent");
    }

    // Wait for any pending connection for this agent
    const pending = this.connectionPromises.get(targetAgentId);
    if (pending) {
      await pending;
    }

    const connection = this.connections.get(targetAgentId);
    if (!connection) {
      throw new Error(`Agent ${targetAgentId} not connected`);
    }

    const sessionKey = this.getSessionKey(targetAgentId, conversationId);
    let sessionId = this.activeSessionIds.get(sessionKey);
    let availableModes: { id: string; name?: string }[] = [];
    let availableModels: { modelId: string; name?: string }[] = [];

    if (!sessionId) {
      // Create session automatically if missing
      const res = await this._newSession(targetAgentId, conversationId, mode);
      sessionId = res.sessionId;

      // Extract modes from newSession response
      availableModes = (res.modes?.availableModes || []).map((m: any) => ({
        id: m.id || m,
        name: m.name || m.id || m,
      }));

      // Extract models from newSession response
      availableModels = (res.models?.availableModels || []).map((m: any) => ({
        modelId: m.modelId || m,
        name: m.name || m.modelId || m,
      }));
    } else {
      // Session already exists, just update mode if provided
      if (mode) {
        await connection.setSessionMode({
          sessionId,
          modeId: mode,
        });
      }
      // For existing sessions, we don't have modes/models info readily available
      // This is a limitation - ideally we should cache this info
      availableModes = [];
      availableModels = [];
    }

    return { connection, sessionId, availableModes, availableModels };
  }

  private getSessionKey(agentId: string, conversationId?: string) {
    return conversationId ? `${agentId}:${conversationId}` : agentId;
  }

  async prompt(
    prompt: string,
    mode?: string,
    model?: string,
    agentId?: string,
    conversationId?: string,
  ) {
    const { connection, sessionId } = await this.ensureSession(
      agentId,
      conversationId,
      mode,
    );

    console.log("Prompting with session", sessionId, "and prompt", prompt);

    return connection.prompt({
      sessionId,
      prompt: [{ type: "text", text: prompt }],
    });
  }

  async cancel(agentId?: string, conversationId?: string) {
    const { connection, sessionId } = await this.ensureSession(
      agentId,
      conversationId,
    );

    return connection.cancel({
      sessionId,
    });
  }

  async setSessionMode(
    mode: string,
    agentId?: string,
    conversationId?: string,
  ) {
    const { connection, sessionId } = await this.ensureSession(
      agentId,
      conversationId,
    );

    const res = await connection.setSessionMode({
      sessionId,
      modeId: mode,
    });

    return res;
  }

  async newSession(
    agentId?: string,
    conversationId?: string,
    mode?: string,
  ): Promise<{ sessionId: string; modes?: acp.SessionModeState | null }> {
    return this._newSession(
      agentId || this.activeAgentId,
      conversationId,
      mode,
    );
  }

  private async _newSession(
    agentId?: string,
    conversationId?: string,
    mode?: string,
  ): Promise<{
    sessionId: string;
    modes?: acp.SessionModeState | null;
    models?: acp.SessionModelState | null;
  }> {
    if (!agentId) {
      throw new Error("No agent ID specified for new session");
    }

    const connection = this.connections.get(agentId);
    if (!connection) {
      throw new Error(`Agent ${agentId} not connected`);
    }

    const workspaceDirs = await this.ide.getWorkspaceDirs();
    let cwd = workspaceDirs[0] || process.cwd();
    if (cwd.startsWith("file://")) {
      cwd = cwd.replace("file://", "");
    }

    const timeout = (ms: number, msg: string) =>
      new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

    const sessionResponse = (await Promise.race([
      connection.newSession({
        cwd,
        mcpServers: [],
      }),
      timeout(10000, `New session timeout with agent ${agentId} after 10s`),
    ])) as acp.NewSessionResponse;

    if (!sessionResponse.sessionId) {
      throw new Error(
        "Failed to create new ACP session: no sessionId returned",
      );
    }

    this.activeSessionIds.set(
      this.getSessionKey(agentId, conversationId),
      sessionResponse.sessionId as string,
    );

    const availableModes = (sessionResponse.modes?.availableModes || []).map(
      (m: any) => ({
        id: m.id || m,
        name: m.name || m.id || m,
      }),
    );

    const availableModels = (sessionResponse.models?.availableModels || []).map(
      (m: any) => ({
        modelId: m.modelId || m,
        name: m.name || m.modelId || m,
      }),
    );

    const currentModelId = sessionResponse.models?.currentModelId;

    // Always send modes update to UI, even if empty
    this.messenger.send("acp/availableModesUpdate", {
      modes: availableModes as any,
    });

    // Send models update to UI
    this.messenger.send("acp/availableModelsUpdate", {
      models: availableModels,
    });

    // Send current model update to UI if available
    if (currentModelId) {
      this.messenger.send("acp/currentModelUpdate", {
        modelId: currentModelId,
      });
    }

    if (
      availableModes.length > 0 &&
      mode &&
      availableModes.find((m: any) => m.id === mode)
    ) {
      await connection.setSessionMode({
        sessionId: sessionResponse.sessionId as string,
        modeId: mode,
      });
    }

    return {
      sessionId: sessionResponse.sessionId as string,
      modes: sessionResponse.modes,
      models: sessionResponse.models,
    };
  }
}
