import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { ContextItem } from "../..";
import { MCPManagerSingleton } from "../../context/mcp/MCPManagerSingleton";
import { throwIfFileIsSecurityConcern } from "../../indexing/ignore";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { resolveInputPath } from "../../util/pathResolver";

import { ToolImpl } from ".";
import { getOptionalStringArg, getStringArg } from "../parseArgs";

export const callMcpToolWithFileImpl: ToolImpl = async (args, extras) => {
  const filepath = getStringArg(args, "filepath");
  const target = getStringArg(args, "target");
  const extra_args =
    args.extra_args && typeof args.extra_args === "object"
      ? (args.extra_args as Record<string, any>)
      : {};
  const contentKey = getOptionalStringArg(args, "contentKey") || "content";

  // Resolve the file path
  const resolvedPath = await resolveInputPath(extras.ide, filepath);
  if (!resolvedPath) {
    throw new ContinueError(
      ContinueErrorReason.FileNotFound,
      `File "${filepath}" does not exist or is not accessible.`,
    );
  }

  // Security check
  throwIfFileIsSecurityConcern(resolvedPath.displayPath);

  // Read file content
  const fileContent = await extras.ide.readFile(resolvedPath.uri);

  // Merge file content into extra_args
  const mergedArgs = {
    ...extra_args,
    [contentKey]: fileContent,
  };

  // Parse target to get MCP server and tool name
  // Target format can be:
  // 1. "mcp__server_name__tool_name" (explicit format)
  // 2. "server_tool" (format from getMCPToolName, e.g., "docs_server_search")
  // 3. "tool_name" (just tool name, will search all servers)
  let mcpId: string | undefined;
  let toolName: string | undefined;

  const mcpManager = MCPManagerSingleton.getInstance();
  let client;

  if (target.startsWith("mcp__")) {
    // Format: "mcp__server_name__tool_name"
    const parts = target.split("__");
    if (parts.length >= 3) {
      mcpId = parts[1];
      toolName = parts.slice(2).join("__");
      client = mcpManager.getConnection(mcpId);
      if (!client) {
        throw new ContinueError(
          ContinueErrorReason.Unspecified,
          `MCP server "${mcpId}" not found or not connected`,
        );
      }
    } else {
      throw new ContinueError(
        ContinueErrorReason.Unspecified,
        `Invalid MCP tool target format: ${target}. Expected format: 'mcp__server_name__tool_name'`,
      );
    }
  } else {
    // Try to parse as "server_tool" format first
    // Search through all connections to find matching server and tool
    const statuses = mcpManager.getStatuses();
    let found = false;

    for (const status of statuses) {
      if (status.status === "connected" && status.client) {
        const conn = mcpManager.getConnection(status.id);
        if (!conn || !conn.tools) continue;

        // Normalize server name to match getMCPToolName format
        const serverPrefix = status.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .replace(/_+/g, "_");

        // Check if target matches "server_tool" format
        if (target.startsWith(`${serverPrefix}_`)) {
          const expectedToolName = target.substring(serverPrefix.length + 1);
          const tool = conn.tools.find((t) => t.name === expectedToolName);
          if (tool) {
            client = conn;
            mcpId = status.id;
            toolName = tool.name; // Use original tool name
            found = true;
            break;
          }
        }

        // Also check if target matches just the tool name
        const tool = conn.tools.find((t) => t.name === target);
        if (tool) {
          // If multiple tools with same name exist, prefer the first one found
          // But if we already found one, check if this is more specific
          if (!found || target.startsWith(`${serverPrefix}_`)) {
            client = conn;
            mcpId = status.id;
            toolName = tool.name;
            found = true;
            // Don't break here, continue to check for more specific match
          }
        }
      }
    }

    if (!found || !client || !toolName) {
      throw new ContinueError(
        ContinueErrorReason.Unspecified,
        `MCP tool "${target}" not found in any connected MCP server. Available servers: ${statuses.map((s) => s.name).join(", ")}`,
      );
    }
  }

  if (!client.client) {
    throw new ContinueError(
      ContinueErrorReason.Unspecified,
      "MCP client is not available",
    );
  }

  // Call MCP tool
  const response = await client.client.callTool(
    {
      name: toolName,
      arguments: mergedArgs,
    },
    CallToolResultSchema,
    { timeout: client.options.timeout },
  );

  if (response.isError === true) {
    throw new ContinueError(
      ContinueErrorReason.Unspecified,
      `MCP tool error: ${JSON.stringify(response.content)}`,
    );
  }

  // Convert MCP response to context items
  const contextItems: ContextItem[] = [];
  (response.content as any).forEach((item: any) => {
    if (item.type === "text") {
      contextItems.push({
        name: extras.tool.displayTitle,
        description: "MCP tool output",
        content: item.text,
        icon: extras.tool.faviconUrl,
      });
    } else if (item.type === "resource") {
      if (item.resource?.blob) {
        contextItems.push({
          name: extras.tool.displayTitle,
          description: "MCP Item Error",
          content: "Error: tool call received unsupported blob resource item",
          icon: extras.tool.faviconUrl,
        });
      } else {
        contextItems.push({
          name: extras.tool.displayTitle,
          description: "MCP tool output",
          content: item.resource.text,
          icon: extras.tool.faviconUrl,
        });
      }
    } else {
      contextItems.push({
        name: extras.tool.displayTitle,
        description: "MCP Item Error",
        content: `Error: tool call received unsupported item of type "${item.type}"`,
        icon: extras.tool.faviconUrl,
      });
    }
  });

  return contextItems;
};
