import { describe, expect, it, vi } from "vitest";

describe("Conversation Switch Lifecycle - Abort & Cleanup Contract", () => {
  it("aborts active controller when switching from convA to convB", () => {
    let activeId: string | null = "convA";
    const skipLoadRef = { current: null as string | null };
    const abortRef = { current: new AbortController() as AbortController | null };
    let streamingText: string | null = "partial reply";
    let busy = true;

    // Simulate switching to convB:
    // 1. React runs cleanup of convA with old closed-over conversationId ("convA")
    const convACleanup = () => {
      if (skipLoadRef.current === null) {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        streamingText = null;
        busy = false;
      }
    };

    convACleanup();

    expect(abortRef.current).toBeNull();
    expect(streamingText).toBeNull();
    expect(busy).toBe(false);

    // 2. Effect for convB runs
    const prevId = activeId;
    activeId = "convB";

    expect(prevId).toBe("convA");
    expect(activeId).toBe("convB");
  });

  it("does not abort active request if skipLoadRef matches new conversation (internal send activation)", () => {
    let activeId: string | null = null;
    const skipLoadRef = { current: "newConvId" as string | null };
    const controller = new AbortController();
    const abortRef = { current: controller as AbortController | null };
    const abortSpy = vi.spyOn(controller, "abort");

    // When transitioning from null -> newConvId via send():
    // Cleanup of previous effect (null) runs first:
    const prevCleanup = () => {
      if (skipLoadRef.current === null) {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
      }
    };

    prevCleanup();

    // Verify request was NOT aborted
    expect(abortSpy).not.toHaveBeenCalled();
    expect(abortRef.current).toBe(controller);

    // Next effect runs for newConvId:
    activeId = "newConvId";
    if (activeId !== null && skipLoadRef.current === activeId) {
      skipLoadRef.current = null;
    }

    expect(skipLoadRef.current).toBeNull();
    expect(activeId).toBe("newConvId");
  });

  it("aborts active request on unmount", () => {
    const skipLoadRef = { current: null as string | null };
    const controller = new AbortController();
    const abortRef = { current: controller as AbortController | null };
    const abortSpy = vi.spyOn(controller, "abort");

    const cleanup = () => {
      if (skipLoadRef.current === null) {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
      }
    };

    cleanup();
    expect(abortSpy).toHaveBeenCalled();
    expect(abortRef.current).toBeNull();
  });
});
