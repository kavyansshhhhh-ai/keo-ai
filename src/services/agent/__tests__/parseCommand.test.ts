import { describe, expect, it } from "vitest";
import { parseCommand } from "@/services/agent/parseCommand";

describe("parseCommand - Agent Command Parser", () => {
  it("parses single app open intent for YouTube", () => {
    const res = parseCommand("open youtube");
    expect(res.type).toBe("action");
    if (res.type === "action") {
      expect(res.action.kind).toBe("open_app");
      expect(res.action.androidPackage).toBe("com.google.android.youtube");
    }
  });

  it("parses flashlight on command", () => {
    const res = parseCommand("turn on flashlight");
    expect(res.type).toBe("action");
    if (res.type === "action") {
      expect(res.action.kind).toBe("flashlight");
      expect(res.action.torch).toBe(true);
    }
  });

  it("parses location settings command", () => {
    const res = parseCommand("open location settings");
    expect(res.type).toBe("action");
    if (res.type === "action") {
      expect(res.action.kind).toBe("open_wifi_settings");
    }
  });

  it("parses camera command", () => {
    const res = parseCommand("open camera");
    expect(res.type).toBe("action");
    if (res.type === "action") {
      expect(res.action.kind).toBe("open_camera");
    }
  });

  it("parses battery check command", () => {
    const res = parseCommand("check battery status");
    expect(res.type).toBe("action");
    if (res.type === "action") {
      expect(res.action.kind).toBe("battery");
    }
  });

  it("parses WhatsApp message draft with confirmation required", () => {
    const res = parseCommand("send whatsapp to 9876543210 hello there");
    expect(res.type).toBe("action");
    if (res.type === "action") {
      expect(res.action.kind).toBe("prepare_whatsapp");
      expect(res.action.requiresConfirmation).toBe(true);
    }
  });

  it("blocks financial and destructive operations", () => {
    const res = parseCommand("delete my files and transfer money");
    expect(res.type).toBe("unsupported");
    if (res.type === "unsupported") {
      expect(res.message).toContain("can't delete");
    }
  });
});
