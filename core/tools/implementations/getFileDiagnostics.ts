import { ToolImpl } from ".";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { resolveInputPath } from "../../util/pathResolver";
import { getUriPathBasename } from "../../util/uri";
import { getStringArg } from "../parseArgs";

export const getFileDiagnosticsImpl: ToolImpl = async (args, extras) => {
  const filepath = getStringArg(args, "filepath");

  // Resolve the path to get the actual URI
  const resolvedPath = await resolveInputPath(extras.ide, filepath);
  if (!resolvedPath) {
    throw new ContinueError(
      ContinueErrorReason.FileNotFound,
      `File "${filepath}" does not exist or is not accessible. You might want to check the path and try again.`,
    );
  }

  // Get diagnostics for the file (errors only, no warnings)
  const problems = await extras.ide.getProblems(resolvedPath.uri, true);

  if (problems.length === 0) {
    return [
      {
        name: getUriPathBasename(resolvedPath.uri),
        description: `Diagnostics for ${resolvedPath.displayPath}`,
        content: "No diagnostic errors found for this file.",
        uri: {
          type: "file",
          value: resolvedPath.uri,
        },
      },
    ];
  }

  // Format the diagnostics as a readable list
  const diagnosticsList = problems
    .map((problem, index) => {
      const line = problem.range.start.line + 1; // Convert 0-based to 1-based
      const col = problem.range.start.character + 1; // Convert 0-based to 1-based
      return `${index + 1}. Line ${line}, Column ${col}: ${problem.message}`;
    })
    .join("\n");

  const content = `Diagnostic errors for ${resolvedPath.displayPath}:\n\n${diagnosticsList}\n\nTotal: ${problems.length} error(s)`;

  return [
    {
      name: getUriPathBasename(resolvedPath.uri),
      description: `Diagnostics for ${resolvedPath.displayPath}`,
      content,
      uri: {
        type: "file",
        value: resolvedPath.uri,
      },
    },
  ];
};
