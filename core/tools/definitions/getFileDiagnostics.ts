import { Tool } from "../..";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

export const getFileDiagnosticsTool: Tool = {
  type: "function",
  displayTitle: "Get File Diagnostics",
  wouldLikeTo: "get diagnostics for {{{ filepath }}}",
  isCurrently: "getting diagnostics for {{{ filepath }}}",
  hasAlready: "got diagnostics for {{{ filepath }}}",
  readonly: true,
  isInstant: true,
  group: BUILT_IN_GROUP_NAME,
  function: {
    name: BuiltInToolNames.GetFileDiagnostics,
    description:
      "Get a list of diagnostic errors for a specific file. This includes linter errors, type errors, and other error-level diagnostics reported by the IDE. Warnings are excluded.",
    parameters: {
      type: "object",
      required: ["filepath"],
      properties: {
        filepath: {
          type: "string",
          description:
            "The path of the file to get diagnostics for. Can be a relative path (from workspace root), absolute path, tilde path (~/...), or file:// URI",
        },
      },
    },
  },
  systemMessageDescription: {
    prefix: `To get diagnostic errors for a file, use the ${BuiltInToolNames.GetFileDiagnostics} tool. For example, to get errors for a file located at 'path/to/file.ts', you would respond with this:`,
    exampleArgs: [["filepath", "path/to/file.ts"]],
  },
  defaultToolPolicy: "allowedWithoutPermission",
  toolCallIcon: "ExclamationTriangleIcon",
};
