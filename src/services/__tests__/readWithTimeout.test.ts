import { describe, expect, it, vi } from "vitest";
import { readWithTimeout } from "@/services/chatStream";

function createMockReader<T>(options: {
  readImpl?: () => Promise<ReadableStreamReadResult<T>>;
  cancelImpl?: () => Promise<void>;
} = {}) {
  const cancel = vi.fn(options.cancelImpl ?? (() => Promise.resolve()));
  const read = vi.fn(
    options.readImpl ??
      (() =>
        new Promise<ReadableStreamReadResult<T>>((resolve) => {
          setTimeout(
            () => resolve({ done: false, value: "hello" as unknown as T }),
            10
          );
        }))
  );
  const releaseLock = vi.fn();

  const reader = {
    read,
    cancel,
    releaseLock,
    closed: Promise.resolve(),
  } as unknown as ReadableStreamDefaultReader<T>;

  return { reader, cancel, read, releaseLock };
}

describe("readWithTimeout - Settled-safe Stream Reader", () => {
  it("resolves normally when read succeeds before timeout", async () => {
    const { reader, cancel } = createMockReader<string>({
      readImpl: () => Promise.resolve({ done: false, value: "token-1" }),
    });

    const res = await readWithTimeout(reader, 1000);
    expect(res).toEqual({ done: false, value: "token-1" });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cleans up timer and abort listener upon successful resolve", async () => {
    const controller = new AbortController();
    const removeListenerSpy = vi.spyOn(controller.signal, "removeEventListener");

    const { reader } = createMockReader<string>({
      readImpl: () => Promise.resolve({ done: false, value: "test" }),
    });

    await readWithTimeout(reader, 500, controller.signal);
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("rejects with 'Stream read timeout' when timeout fires and cancels reader", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const removeListenerSpy = vi.spyOn(controller.signal, "removeEventListener");

      const { reader, cancel } = createMockReader<string>({
        readImpl: () => new Promise(() => {}), // never resolves
      });

      const promise = readWithTimeout(reader, 100, controller.signal);
      vi.advanceTimersByTime(101);

      await expect(promise).rejects.toThrow("Stream read timeout");
      expect(cancel).toHaveBeenCalled();
      expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects with 'Generation cancelled by user.' when AbortSignal fires during read", async () => {
    const controller = new AbortController();
    const { reader, cancel } = createMockReader<string>({
      readImpl: () => new Promise(() => {}), // never resolves
    });

    const promise = readWithTimeout(reader, 5000, controller.signal);
    controller.abort();

    await expect(promise).rejects.toThrow("Generation cancelled by user.");
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects immediately if signal is already aborted prior to read", async () => {
    const controller = new AbortController();
    controller.abort();

    const { reader, cancel } = createMockReader<string>();

    await expect(readWithTimeout(reader, 5000, controller.signal)).rejects.toThrow(
      "Generation cancelled by user."
    );
    expect(cancel).toHaveBeenCalled();
  });

  it("prevents double-resolve or unhandled rejection when read completes after timeout", async () => {
    vi.useFakeTimers();
    try {
      let lateResolve: (res: ReadableStreamReadResult<string>) => void = () => {};
      const { reader } = createMockReader<string>({
        readImpl: () =>
          new Promise((resolve) => {
            lateResolve = resolve;
          }),
      });

      const promise = readWithTimeout(reader, 50);
      vi.advanceTimersByTime(51);

      await expect(promise).rejects.toThrow("Stream read timeout");

      // Late resolution after timeout should safely be ignored without crashing
      expect(() => {
        lateResolve({ done: false, value: "late token" });
      }).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles read error rejection and cleans up properly", async () => {
    const controller = new AbortController();
    const removeListenerSpy = vi.spyOn(controller.signal, "removeEventListener");

    const { reader } = createMockReader<string>({
      readImpl: () => Promise.reject(new Error("Network pipe broken")),
    });

    await expect(readWithTimeout(reader, 1000, controller.signal)).rejects.toThrow(
      "Network pipe broken"
    );
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
