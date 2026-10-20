import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setActiveAgent, setBrainMode } from "../redux/slices/sessionSlice";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "./ui";

import { cn } from "../util/cn";

export interface BrainModeSelectProps {
  disabled?: boolean;
}

export function BrainModeSelect({ disabled }: BrainModeSelectProps) {
  const dispatch = useAppDispatch();
  const brainMode = useAppSelector((store) => store.session.brainMode);
  const activeAgentId = useAppSelector((store) => store.session.activeAgentId);
  const agents = useAppSelector((state) => state.config.config.agent_servers);

  const handleSelect = (value: string) => {
    if (value === "llm") {
      dispatch(setBrainMode("llm"));
    } else {
      dispatch(setBrainMode("agent"));
      const agent = agents?.find((a) => a.name === value);
      // When switching agents, we reset available models/modes until connection is established
      dispatch(
        setActiveAgent({
          agentId: value,
          models: [],
          modes: [],
          allowSelectModel: agent?.allowSelectModel,
        }),
      );
    }
  };

  const getLabel = () => {
    const agentName =
      agents?.find(
        (a) => a.provider === activeAgentId || a.name === activeAgentId,
      )?.name ?? "unknown";
    return `Agent: ${agentName}`;
  };

  return (
    <div className="flex items-center gap-1">
      <Listbox
        value={brainMode === "llm" ? "llm" : activeAgentId || "agent"}
        disabled={disabled}
        onChange={handleSelect}
      >
        <div className="relative">
          <ListboxButton
            className={cn(
              "xs:px-2 text-description bg-lightgray/20 gap-1 rounded-full border-none px-1.5 py-0.5 transition-colors duration-200 hover:brightness-110",
              disabled && "cursor-not-allowed opacity-50 hover:brightness-100",
            )}
          >
            <span className="hidden sm:block">{getLabel()}</span>
            <ChevronDownIcon
              className="h-2 w-2 flex-shrink-0"
              aria-hidden="true"
            />
          </ListboxButton>
          <ListboxOptions className="min-w-40 max-w-64">
            {agents && agents.length > 0 && (
              <>
                {agents.map((agent) => {
                  const agentId = agent.name;
                  return (
                    <ListboxOption key={agentId} value={agentId}>
                      <div className="flex w-full flex-row items-center gap-1.5">
                        <span>{agent.name}</span>
                        {brainMode === "agent" && activeAgentId === agentId && (
                          <CheckIcon className="ml-auto h-3 w-3" />
                        )}
                      </div>
                    </ListboxOption>
                  );
                })}
              </>
            )}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );
}
