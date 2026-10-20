import { z } from "zod";
import { ConfigYaml } from "../schemas/index.js";

export const BLOCK_TYPES = [
  "models",
  "context",
  "data",
  "mcpServers",
  "rules",
  "prompts",
  "docs",
  "agent_servers",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const blockTypeSchema = z.enum(BLOCK_TYPES);

export function getBlockType(block: ConfigYaml): BlockType | undefined {
  if (block.context?.length) {
    return "context";
  } else if (block.models?.length) {
    return "models";
  } else if (block.docs?.length) {
    return "docs";
  } else if (block.mcpServers?.length) {
    return "mcpServers";
  } else if (block.data?.length) {
    return "data";
  } else if (block.rules?.length) {
    return "rules";
  } else if (block.prompts?.length) {
    return "prompts";
  } else if (
    (block as any).agent_servers?.length ||
    (block as any).agents?.length
  ) {
    return "agent_servers";
  } else {
    return undefined;
  }
}
