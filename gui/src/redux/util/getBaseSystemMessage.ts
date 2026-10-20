import { ModelDescription, Tool } from "core";
import {
  DEFAULT_AGENT_SYSTEM_MESSAGE,
  DEFAULT_CHAT_SYSTEM_MESSAGE,
  DEFAULT_PLAN_SYSTEM_MESSAGE,
} from "core/llm/defaultSystemMessages";
import { Persona } from "../../pages/config/sections/PersonaSection";

export const NO_TOOL_WARNING =
  "\n\nTHE USER HAS NOT PROVIDED ANY TOOLS, DO NOT ATTEMPT TO USE ANY TOOLS. STOP AND LET THE USER KNOW THAT THERE ARE NO TOOLS AVAILABLE. The user can provide tools by enabling them in the Tool Policies section of the notch (wrench icon)";

export function getBaseSystemMessage(
  messageMode: string,
  model: ModelDescription,
  activeTools?: Tool[],
  persona?: Persona,
): string {
  let baseMessage: string;

  if (messageMode === "agent") {
    baseMessage = model.baseAgentSystemMessage ?? DEFAULT_AGENT_SYSTEM_MESSAGE;
  } else if (messageMode === "plan") {
    baseMessage = model.basePlanSystemMessage ?? DEFAULT_PLAN_SYSTEM_MESSAGE;
  } else {
    baseMessage = model.baseChatSystemMessage ?? DEFAULT_CHAT_SYSTEM_MESSAGE;
  }

  // Add no-tools warning for agent/plan modes when no tools are available
  if (messageMode !== "chat" && (!activeTools || activeTools.length === 0)) {
    baseMessage += NO_TOOL_WARNING;
  }

  if (persona) {
    baseMessage += "\n\n" + buildPersonaSystemMessage(persona);
  }

  return baseMessage;
}

function buildPersonaSystemMessage(persona: Persona) {
  let message = "";

  if (persona.roleDefinition) {
    message += persona.roleDefinition;
  }

  const customInstructions = persona.customInstructions || persona.whenToUse;
  if (customInstructions) {
    if (message) {
      message += "\n\n";
    }
    message += customInstructions;
  }

  if (persona.availableTools) {
    if (message) {
      message += "\n\n";
    }
    message += `Available Tools: ${persona.availableTools}`;
  }

  return message;
}
