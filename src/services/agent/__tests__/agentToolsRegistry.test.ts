import { describe, expect, it } from "vitest";
import { AGENT_TOOLS } from "@/services/agent/agentToolsRegistry";

describe("agentToolsRegistry", () => {
  it("defines core native tools", () => {
    expect(AGENT_TOOLS.open_app).toBeDefined();
    expect(AGENT_TOOLS.flashlight).toBeDefined();
    expect(AGENT_TOOLS.open_location_settings).toBeDefined();
    expect(AGENT_TOOLS.open_camera).toBeDefined();
    expect(AGENT_TOOLS.prepare_whatsapp).toBeDefined();
    expect(AGENT_TOOLS.read_battery).toBeDefined();
    expect(AGENT_TOOLS.share_content).toBeDefined();
  });

  it("enforces confirmation for WhatsApp preparation", () => {
    expect(AGENT_TOOLS.prepare_whatsapp.requiresConfirmation).toBe(true);
  });
});
