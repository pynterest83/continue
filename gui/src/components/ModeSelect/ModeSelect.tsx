import {
  CheckIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { isRecommendedAgentModel } from "core/llm/toolSupport";
import { useCallback, useContext, useEffect, useMemo } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { selectSelectedChatModel } from "../../redux/slices/configSlice";
import { setMode } from "../../redux/slices/sessionSlice";
import { getFontSize, getMetaKeyLabel } from "../../util";
import { ToolTip } from "../gui/Tooltip";
import { useMainEditor } from "../mainInput/TipTapEditor";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "../ui";
import { ModeIcon } from "./ModeIcon";

export function ModeSelect() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((store) => store.session.mode);
  const sessionId = useAppSelector((store) => store.session.id);
  const brainMode = useAppSelector((store) => store.session.brainMode);
  const activeAgentId = useAppSelector((store) => store.session.activeAgentId);
  const availableAgentModes = useAppSelector(
    (store) => store.session.availableAgentModes,
  );
  const selectedModel = useAppSelector(selectSelectedChatModel);
  const ideMessenger = useContext(IdeMessengerContext);

  // ACP agent sessions use the modes reported by the agent
  const agentModes =
    brainMode === "agent" && availableAgentModes.length > 0
      ? availableAgentModes
      : undefined;

  const isGoodAtAgentMode = useMemo(() => {
    if (!selectedModel) {
      return undefined;
    }
    return isRecommendedAgentModel(selectedModel.model);
  }, [selectedModel]);

  const { mainEditor } = useMainEditor();
  const metaKeyLabel = useMemo(() => {
    return getMetaKeyLabel();
  }, []);

  const applyMode = useCallback(
    (newMode: string) => {
      dispatch(setMode(newMode));
      if (brainMode === "agent") {
        void ideMessenger.request("acp/setSessionMode", {
          mode: newMode,
          agentId: activeAgentId,
          conversationId: sessionId,
        });
      }
    },
    [dispatch, brainMode, ideMessenger, activeAgentId, sessionId],
  );

  const cycleMode = useCallback(() => {
    const modes = agentModes
      ? agentModes.map((m) => m.id)
      : ["chat", "plan", "agent"];
    applyMode(modes[(modes.indexOf(mode) + 1) % modes.length]);
    // Only focus main editor if another one doesn't already have focus
    if (!document.activeElement?.classList?.contains("ProseMirror")) {
      mainEditor?.commands.focus();
    }
  }, [agentModes, mode, applyMode, mainEditor]);

  const selectMode = useCallback(
    (newMode: string) => {
      if (newMode === mode) {
        return;
      }

      applyMode(newMode);

      mainEditor?.commands.focus();
    },
    [mode, applyMode, mainEditor],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "." && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void cycleMode();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cycleMode]);

  const notGreatAtAgent = (mode: string) => (
    <>
      <ToolTip
        style={{
          zIndex: 200001, // in front of listbox
        }}
        className="flex items-center gap-1"
        content={`${mode} might not work well with this model.`}
      >
        <ExclamationTriangleIcon className="text-warning h-2.5 w-2.5" />
      </ToolTip>
    </>
  );

  return (
    <Listbox value={mode} onChange={selectMode}>
      <div className="relative">
        <ListboxButton
          data-testid="mode-select-button"
          className="xs:px-2 text-description bg-lightgray/20 gap-1 rounded-full border-none px-1.5 py-0.5 transition-colors duration-200 hover:brightness-110"
        >
          <ModeIcon mode={mode} />
          <span className="hidden capitalize sm:block">
            {agentModes
              ? (agentModes.find((m) => m.id === mode)?.name ?? mode)
              : mode === "chat"
                ? "Chat"
                : mode === "agent"
                  ? "Agent"
                  : "Plan"}
          </span>
          <ChevronDownIcon
            className="h-2 w-2 flex-shrink-0"
            aria-hidden="true"
          />
        </ListboxButton>
        <ListboxOptions className="min-w-32 max-w-48">
          {agentModes?.map((agentMode) => (
            <ListboxOption key={agentMode.id} value={agentMode.id}>
              <div className="flex flex-row items-center gap-1.5">
                <ModeIcon mode={agentMode.id} />
                <span className="capitalize">
                  {agentMode.name || agentMode.id}
                </span>
              </div>
              {mode === agentMode.id && (
                <CheckIcon className="ml-auto h-3 w-3" />
              )}
            </ListboxOption>
          ))}
          {!agentModes && (
            <>
          <ListboxOption value="chat">
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="chat" />
              <span className="">Chat</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="All tools disabled"
              >
                <InformationCircleIcon
                  data-tooltip-id="chat-tip"
                  className="h-2.5 w-2.5 flex-shrink-0"
                />
              </ToolTip>
              <span
                className={`text-description-muted text-[${getFontSize() - 3}px] mr-auto`}
              >
                {getMetaKeyLabel()}L
              </span>
            </div>
            {mode === "chat" && <CheckIcon className="ml-auto h-3 w-3" />}
          </ListboxOption>
          <ListboxOption value="plan" className={"gap-1"}>
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="plan" />
              <span className="">Plan</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="Read-only/MCP tools available"
              >
                <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
              </ToolTip>
            </div>
            {!isGoodAtAgentMode && notGreatAtAgent("Plan")}
            <CheckIcon
              className={`ml-auto h-3 w-3 ${mode === "plan" ? "" : "opacity-0"}`}
            />
          </ListboxOption>

          <ListboxOption value="agent" className={"gap-1"}>
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="agent" />
              <span className="">Agent</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="All tools available"
              >
                <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
              </ToolTip>
            </div>
            {!isGoodAtAgentMode && notGreatAtAgent("Agent")}
            <CheckIcon
              className={`ml-auto h-3 w-3 ${mode === "agent" ? "" : "opacity-0"}`}
            />
          </ListboxOption>
            </>
          )}

          <div className="text-description-muted px-2 py-1">
            {`${metaKeyLabel} . for next mode`}
          </div>
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
