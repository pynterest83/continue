import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ToolCallState } from "core";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks";
import { selectPendingToolCalls } from "../../../../redux/selectors/selectToolCalls";
import {
  DEFAULT_TOOL_SETTING,
  setDialogMessage,
  setShowDialog,
  setToolBypassHighRisk,
} from "../../../../redux/slices/uiSlice";
import { callToolById } from "../../../../redux/thunks/callToolById";
import { cancelToolCallThunk } from "../../../../redux/thunks/cancelToolCall";
import { getAltKeyLabel, getMetaKeyLabel, isJetBrains } from "../../../../util";
import ConfirmationDialog from "../../../dialogs/ConfirmationDialog";
import { ToolTip } from "../../../gui/Tooltip";
import { Button } from "../../../ui";
import { useMainEditor } from "../../TipTapEditor";

export const generateToolCallButtonTestId = (
  action: "accept" | "reject" | "accept-high-risk",
  toolCallId: string,
) => {
  return `${action}-tool-call-button-${toolCallId}`;
};

/**
 * Checks if a tool call is a high risk override scenario:
 * - Tool is runTerminalCommand (only supported tool for high risk bypass)
 * - User set "Automatic" (basePolicy = allowedWithoutPermission)
 * - But the tool is pending approval (meaning security check upgraded it to allowedWithPermission)
 * - And bypass is not already enabled
 */
function isHighRiskOverride(
  toolCall: ToolCallState,
  toolSettings: Record<string, string>,
  toolBypassHighRisk: Record<string, boolean>,
): boolean {
  const toolName = toolCall.toolCall.function.name;

  // Only show "Accept High Risk" for run_terminal_command
  if (toolName !== "run_terminal_command") {
    return false;
  }

  const basePolicy =
    toolSettings[toolName] ??
    toolCall.tool?.defaultToolPolicy ??
    DEFAULT_TOOL_SETTING;

  // If user set "Automatic" but tool is still pending (status = "generated"),
  // it means security check upgraded it to "allowedWithPermission"
  const isAutomatic = basePolicy === "allowedWithoutPermission";
  const isPending = toolCall.status === "generated";
  const bypassEnabled = toolBypassHighRisk[toolName] ?? false;

  return isAutomatic && isPending && !bypassEnabled;
}

export function PendingToolCallToolbar() {
  const dispatch = useAppDispatch();
  const jetbrains = isJetBrains();
  const pendingToolCalls = useAppSelector(selectPendingToolCalls);
  const toolSettings = useAppSelector((state) => state.ui.toolSettings);
  const toolBypassHighRisk = useAppSelector(
    (state) => state.ui.toolBypassHighRisk,
  );
  const editor = useMainEditor();

  if (pendingToolCalls.length === 0) {
    return null;
  }

  const handleAccept = (toolCallId: string) => {
    void dispatch(callToolById({ toolCallId }));
  };

  const confirmAndAcceptHighRisk = (toolCall: ToolCallState) => {
    const toolName = toolCall.toolCall.function.name;
    // Set bypass flag for this tool
    dispatch(setToolBypassHighRisk({ toolName, bypass: true }));
    // Then approve the tool call
    void dispatch(callToolById({ toolCallId: toolCall.toolCallId }));
  };

  const handleAcceptHighRisk = (toolCall: ToolCallState) => {
    // Show confirmation dialog before enabling high risk
    dispatch(
      setDialogMessage(
        <ConfirmationDialog
          title="⚠️ Accept High Risk?"
          text={`WARNING: This will approve the current command AND automatically approve ALL future high-risk terminal commands without asking, including:

• npm install / yarn add (can execute arbitrary scripts)
• curl / wget (can download malicious content)
• git clone (can execute post-checkout hooks)
• docker run (can access system resources)

Critical commands (sudo, rm -rf /, etc.) will still be blocked.

Are you sure you want to enable this?`}
          confirmText="Yes, Accept High Risk"
          onConfirm={() => confirmAndAcceptHighRisk(toolCall)}
        />,
      ),
    );
    dispatch(setShowDialog(true));
  };

  const handleReject = (toolCallId: string) => {
    // put cursor in editor after last rejection
    if (pendingToolCalls.length === 1) {
      editor.mainEditor?.commands.focus();
    }
    void dispatch(cancelToolCallThunk({ toolCallId }));
  };

  return (
    <div className="flex w-full flex-col pb-0.5">
      {pendingToolCalls.map((toolCall, index) => {
        const showHighRiskButton = isHighRiskOverride(
          toolCall,
          toolSettings,
          toolBypassHighRisk,
        );

        return (
          <div
            key={toolCall.toolCallId}
            className="border-input bg-input flex items-center gap-2 rounded border"
          >
            <span className="text-description flex-1 truncate text-xs italic">
              {toolCall.tool?.displayTitle ?? toolCall.toolCall.function.name}
            </span>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-description-muted my-1 font-medium"
                onClick={() => handleReject(toolCall.toolCallId)}
                data-testid={generateToolCallButtonTestId(
                  "reject",
                  toolCall.toolCallId,
                )}
              >
                {/* JetBrains overrides cmd+backspace, so we have to use another shortcut */}
                {index === 0 && (
                  <span className="text-2xs mr-1">
                    {jetbrains ? getAltKeyLabel() : getMetaKeyLabel()}⌫
                  </span>
                )}
                <span>Reject</span>
              </Button>

              <Button
                variant="primary"
                size="sm"
                className="my-1 font-medium"
                onClick={() => handleAccept(toolCall.toolCallId)}
                data-testid={generateToolCallButtonTestId(
                  "accept",
                  toolCall.toolCallId,
                )}
              >
                {index === 0 && (
                  <span className="text-2xs mr-1">{getMetaKeyLabel()}⏎</span>
                )}
                <span>Accept</span>
              </Button>

              {showHighRiskButton && (
                <ToolTip
                  content="Approve this command and automatically approve all high risk commands in the future"
                  place="top"
                >
                  <Button
                    variant="primary"
                    size="sm"
                    className="my-1 bg-yellow-600 font-medium hover:bg-yellow-700"
                    onClick={() => handleAcceptHighRisk(toolCall)}
                    data-testid={generateToolCallButtonTestId(
                      "accept-high-risk",
                      toolCall.toolCallId,
                    )}
                  >
                    <ExclamationTriangleIcon className="mr-1 h-3 w-3" />
                    <span>Accept High Risk</span>
                  </Button>
                </ToolTip>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
