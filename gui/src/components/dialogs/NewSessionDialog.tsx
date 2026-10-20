import styled from "styled-components";
import {
  defaultBorderRadius,
  vscBackground,
  vscButtonBackground,
  vscForeground,
} from "..";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { setActiveAgent, setBrainMode } from "../../redux/slices/sessionSlice";
import { setShowDialog } from "../../redux/slices/uiSlice";
import { exitEdit } from "../../redux/thunks/edit";
import {
  newSessionThunk,
  saveCurrentSession,
} from "../../redux/thunks/session";

const DialogWrapper = styled.div`
  padding: 14px;
  display: flex;
  flex-direction: column;
  color: ${vscForeground};
  background-color: ${vscBackground};
  box-sizing: border-box;
`;

const Header = styled.div`
  margin-bottom: 8px;
  padding-right: 28px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: ${vscForeground};
`;

const Description = styled.p`
  margin: 2px 0 0 0;
  opacity: 0.6;
  font-size: 0.75rem;
  line-height: 1.3;
`;

const OptionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 4px 0;

  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }
`;

const SectionTitle = styled.span`
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.5;
  letter-spacing: 0.4px;
`;

const OptionButton = styled.button<{ $isHighlighted?: boolean }>`
  padding: 8px 10px;
  border-radius: ${defaultBorderRadius};
  border: 1px solid
    ${(props) =>
      props.$isHighlighted ? vscButtonBackground : "rgba(255, 255, 255, 0.08)"};
  background-color: ${(props) =>
    props.$isHighlighted
      ? "rgba(59, 130, 246, 0.05)"
      : "rgba(255, 255, 255, 0.02)"};
  color: ${vscForeground};
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &:hover {
    background-color: ${(props) =>
      props.$isHighlighted
        ? "rgba(59, 130, 246, 0.1)"
        : "rgba(255, 255, 255, 0.08)"};
    border-color: ${(props) =>
      props.$isHighlighted ? vscButtonBackground : "rgba(255, 255, 255, 0.2)"};
  }
`;

const OptionTitle = styled.div`
  font-weight: 500;
  font-size: 0.85rem;
`;

const OptionDescription = styled.div`
  font-size: 0.7rem;
  opacity: 0.5;
`;

interface NewSessionDialogProps {
  isInEdit: boolean;
}

export function NewSessionDialog({ isInEdit }: NewSessionDialogProps) {
  const dispatch = useAppDispatch();
  const agents = useAppSelector((state) => state.config.config.agent_servers);
  const hasHistory = useAppSelector(
    (state) => state.session.history.length > 0,
  );

  const handleCreateSession = async (options?: {
    brainMode: "llm" | "agent";
    agentId?: string;
  }) => {
    dispatch(setShowDialog(false));

    if (isInEdit) {
      await dispatch(exitEdit({}));
    } else if (hasHistory) {
      await dispatch(
        saveCurrentSession({
          openNewSession: false,
          generateTitle: true,
        }),
      );
    }

    if (options) {
      dispatch(setBrainMode(options.brainMode));
      if (options.brainMode === "agent" && options.agentId) {
        const agent = agents?.find((a) => a.name === options.agentId);
        dispatch(
          setActiveAgent({
            agentId: options.agentId,
            models: [],
            modes: [],
            allowSelectModel: agent?.allowSelectModel,
          }),
        );
      }
    }

    dispatch(newSessionThunk());
  };

  return (
    <DialogWrapper>
      <Header>
        <Title>New Session</Title>
        <Description>How would you like to start?</Description>
      </Header>

      <OptionsContainer>
        <OptionButton
          onClick={() => handleCreateSession({ brainMode: "llm" })}
          $isHighlighted
        >
          <OptionTitle>LLM as Brain</OptionTitle>
          <OptionDescription>
            Chat directly with a standard model
          </OptionDescription>
        </OptionButton>

        {agents && agents.length > 0 && (
          <>
            <SectionHeader>
              <SectionTitle>Agents</SectionTitle>
            </SectionHeader>
            {agents.map((agent) => (
              <OptionButton
                key={agent.name}
                onClick={() =>
                  handleCreateSession({
                    brainMode: "agent",
                    agentId: agent.name,
                  })
                }
              >
                <OptionTitle>{agent.name}</OptionTitle>
              </OptionButton>
            ))}
          </>
        )}
      </OptionsContainer>
    </DialogWrapper>
  );
}
