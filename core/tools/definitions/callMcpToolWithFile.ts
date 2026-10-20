import { Tool } from "../..";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

export const callMcpToolWithFileTool: Tool = {
  type: "function",
  displayTitle: "Call MCP Tool With File",
  wouldLikeTo: "call MCP tool {{{ target }}} with file {{{ filepath }}}",
  isCurrently: "calling MCP tool {{{ target }}} with file {{{ filepath }}}",
  hasAlready: "called MCP tool {{{ target }}} with file {{{ filepath }}}",
  // It can call any MCP tool, including ones that write or delete.
  readonly: false,
  isInstant: false,
  group: BUILT_IN_GROUP_NAME,
  function: {
    name: BuiltInToolNames.CallMcpToolWithFile,
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
  },
  systemMessageDescription: {
    prefix: `To read a file and pass its content to an MCP tool, use the ${BuiltInToolNames.CallMcpToolWithFile} tool. For example, to read a file at 'path/to/file.txt' and pass it to an MCP tool named 'mcp__server__process_file', you would respond with this:`,
    exampleArgs: [
      ["filepath", "path/to/file.txt"],
      ["target", "mcp__server__process_file"],
    ],
  },
  defaultToolPolicy: "allowedWithPermission",
  toolCallIcon: "DocumentIcon",
};
