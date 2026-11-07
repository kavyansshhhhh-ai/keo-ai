import { parseCommand, type ParsedCommand } from "@/services/agent/parseCommand";

export interface FastRouterResult {
  handledLocally: boolean;
  parsed: ParsedCommand;
}

/**
 * Fast local command router for deterministic tasks.
 * Evaluates natural language commands in <5ms without calling LLM endpoints for standard actions.
 */
export function routeCommandFast(text: string): FastRouterResult {
  const parsed = parseCommand(text);

  if (parsed.type === "action" || parsed.type === "clarify" || parsed.type === "unsupported") {
    return {
      handledLocally: true,
      parsed,
    };
  }

  return {
    handledLocally: false,
    parsed: { type: "none" },
  };
}
