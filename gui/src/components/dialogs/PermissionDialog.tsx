import * as acp from "@agentclientprotocol/sdk";
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscBackground,
  vscButtonBackground,
  vscButtonForeground,
  vscForeground,
} from "..";

const DialogWrapper = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: ${vscForeground};
  background-color: ${vscBackground};
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: ${vscForeground};
`;

const ToolCallInfo = styled.div`
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: ${defaultBorderRadius};
  padding: 12px;
  border-left: 4px solid #3b82f6;
`;

const ToolTitle = styled.div`
  font-weight: 600;
  margin-bottom: 4px;
`;

const ToolInput = styled.pre`
  margin: 0;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.85rem;
  opacity: 0.8;
  white-space: pre-wrap;
  word-break: break-all;
`;

const ButtonContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
`;

const PermissionButton = styled.button<{
  $isPrimary?: boolean;
  $isDestructive?: boolean;
}>`
  padding: 8px 16px;
  border-radius: ${defaultBorderRadius};
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;

  background-color: ${(props) =>
    props.$isDestructive
      ? "#ef4444"
      : props.$isPrimary
        ? vscButtonBackground
        : "transparent"};

  color: ${(props) =>
    props.$isDestructive || props.$isPrimary
      ? vscButtonForeground
      : vscForeground};

  border: ${(props) =>
    !props.$isPrimary && !props.$isDestructive
      ? `1px solid ${vscForeground}33`
      : "none"};

  &:hover {
    background-color: ${(props) =>
      props.$isDestructive
        ? "#dc2626"
        : props.$isPrimary
          ? vscButtonBackground
          : "rgba(255, 255, 255, 0.1)"};
    filter: ${(props) => (props.$isPrimary ? "brightness(1.2)" : "none")};
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
  }
`;

interface PermissionDialogProps {
  params: acp.RequestPermissionRequest;
  onResponse: (response: acp.RequestPermissionResponse) => void;
}

const PermissionDialog = ({ params, onResponse }: PermissionDialogProps) => {
  const { toolCall, options } = params;

  return (
    <DialogWrapper>
      <Title>Permission Required</Title>
      <p style={{ margin: 0, opacity: 0.9 }}>
        The agent is requesting permission to execute the following tool:
      </p>

      <ToolCallInfo>
        <ToolTitle>{toolCall.title}</ToolTitle>
        <ToolInput>
          {toolCall.rawInput
            ? JSON.stringify(toolCall.rawInput, null, 2)
            : "No input provided"}
        </ToolInput>
      </ToolCallInfo>

      <ButtonContainer>
        {options.map((option: acp.PermissionOption) => (
          <PermissionButton
            key={option.optionId}
            id={option.optionId}
            title={option.name}
            $isPrimary={option.kind.startsWith("allow")}
            $isDestructive={option.kind.startsWith("reject")}
            onClick={() =>
              onResponse({
                outcome: {
                  outcome: "selected",
                  optionId: option.optionId,
                },
              })
            }
          >
            {option.name}
          </PermissionButton>
        ))}
        <PermissionButton
          onClick={() =>
            onResponse({
              outcome: {
                outcome: "cancelled",
              },
            })
          }
        >
          Cancel
        </PermissionButton>
      </ButtonContainer>
    </DialogWrapper>
  );
};

export default PermissionDialog;
