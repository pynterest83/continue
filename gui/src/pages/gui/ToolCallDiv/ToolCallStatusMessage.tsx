import { Tool, ToolCallState } from "core";
import Mustache from "mustache";
import { getStatusIntro } from "./utils";

interface ToolCallStatusMessageProps {
  tool: Tool | undefined;
  toolCallState: ToolCallState;
}

export function ToolCallStatusMessage({
  tool,
  toolCallState,
}: ToolCallStatusMessageProps) {
  const toolName = tool
    ? (tool.displayTitle ?? tool.function.name)
    : toolCallState.toolCall.function.name || "Agent tool";
  const defaultToolDescription = tool ? `${toolName} tool` : toolName;

  const futureMessage: string = tool?.wouldLikeTo
    ? Mustache.render(tool.wouldLikeTo, toolCallState.parsedArgs)
    : `use ${defaultToolDescription}`;

  let intro = getStatusIntro(toolCallState.status, tool?.isInstant);
  let message = "";

  // Handle the special case for "done" status or instant tools that are calling
  if (
    toolCallState.status === "done" ||
    (tool?.isInstant && toolCallState.status === "calling")
  ) {
    message = tool?.hasAlready
      ? Mustache.render(tool.hasAlready, toolCallState.parsedArgs)
      : `used ${defaultToolDescription}`;
  } else {
    switch (toolCallState.status) {
      case "generating":
      case "generated":
      case "canceled":
      case "errored":
        message = futureMessage;
        break;
      case "calling":
        message = tool?.isCurrently
          ? Mustache.render(tool.isCurrently, toolCallState.parsedArgs)
          : `calling ${defaultToolDescription}`;
        break;
      default:
        message = defaultToolDescription;
    }
  }

  // If we don't have a specific tool definition, append the arguments to show what is happening
  if (!tool && toolCallState.toolCall.function.arguments) {
    const args = toolCallState.toolCall.function.arguments;
    if (args && args !== "{}" && args !== "") {
      message += ` (${args})`;
    }
  }

  return (
    <div
      className="text-description line-clamp-4 min-w-0 break-words"
      data-testid="tool-call-title"
    >
      {intro ? `Continue ${intro} ${message}` : `Continue ${message}`}
    </div>
  );
}
