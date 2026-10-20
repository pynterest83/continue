import * as fs from "fs";

import { throwIfFileIsSecurityConcern } from "core/indexing/ignore.js";
import { ContinueError, ContinueErrorReason } from "core/util/errors.js";

import { services } from "../services/index.js";
import { formatToolArgument } from "./formatters.js";
import { Tool } from "./types.js";

/**
 * Reads a file and passes its content to an MCP tool, so the model does not
 * have to copy file contents into tool arguments itself:
 * 1. Read the file at filepath.
 * 2. Merge the content into extra_args under contentKey (default "content").
 * 3. Call the target MCP tool with the merged arguments.
 */
export const callMcpToolWithFileTool: Tool = {
  name: "CallMcpToolWithFile",
  displayName: "Call MCP Tool With File",
  description:
    "Read a file and pass its content to an MCP tool. This tool reads the file content and calls the specified MCP tool with the file content merged into the provided arguments.",
  parameters: {
    type: "object",
    required: ["filepath", "target"],
    properties: {
      filepath: {
        type: "string",
        description:
          "The path to the file to read. The entire content of this file will be passed to the MCP tool.",
      },
      target: {
        type: "string",
        description:
          "The name of the MCP tool to call (e.g., 'mcp__server_name__tool_name' or just 'tool_name' if unique).",
      },
      extra_args: {
        type: "object",
        description:
          "Additional arguments to pass to the target MCP tool. The file content will be merged into these arguments using the 'contentKey' parameter name (default: 'content').",
      },
      contentKey: {
        type: "string",
        description:
          "The parameter name to use for the file content in the MCP tool call. Defaults to 'content' if not specified.",
      },
    },
  },
  // It can call any MCP tool, including ones that write or delete.
  readonly: false,
  isBuiltIn: true,
  preprocess: async (args) => {
    let { filepath } = args;
    if (filepath.startsWith("./")) {
      filepath = filepath.slice(2);
    }
    throwIfFileIsSecurityConcern(filepath);
    return {
      args,
      preview: [
        {
          type: "text",
          content: `Will read ${formatToolArgument(filepath)} and pass to MCP tool ${formatToolArgument(args.target)}`,
        },
      ],
    };
  },
  run: async (args: {
    filepath: string;
    target: string;
    extra_args?: Record<string, any>;
    contentKey?: string;
  }): Promise<string> => {
    try {
      let { filepath, target, extra_args = {}, contentKey = "content" } = args;

      // Normalize filepath
      if (filepath.startsWith("./")) {
        filepath = filepath.slice(2);
      }

      // Check if file exists
      if (!fs.existsSync(filepath)) {
        throw new ContinueError(
          ContinueErrorReason.Unspecified,
          `File does not exist: ${filepath}`,
        );
      }

      // Read file content
      const realPath = fs.realpathSync(filepath);
      const fileContent = fs.readFileSync(realPath, "utf-8");

      // Merge file content into extra_args
      const mergedArgs = {
        ...extra_args,
        [contentKey]: fileContent,
      };

      // Call MCP tool
      if (!services.mcp) {
        throw new ContinueError(
          ContinueErrorReason.Unspecified,
          "MCP service is not available",
        );
      }

      const result = await services.mcp.runTool(target, mergedArgs);

      // Format result
      if (result?.content) {
        // If content is an array, format it nicely
        if (Array.isArray(result.content)) {
          return JSON.stringify(result.content, null, 2);
        }
        // If content is an object, stringify it
        if (typeof result.content === "object") {
          return JSON.stringify(result.content, null, 2);
        }
        // Otherwise return as string
        return String(result.content);
      }

      return "Tool executed successfully (no content returned)";
    } catch (error) {
      if (error instanceof ContinueError) {
        throw error;
      }
      throw new Error(
        `Error calling MCP tool with file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },
};
