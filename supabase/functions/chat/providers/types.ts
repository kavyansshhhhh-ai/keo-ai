export type ChatRole = "user" | "assistant";

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface StreamRequest {
  apiKey: string;
  systemPrompt: string;
  messages: ChatTurn[];
}

export interface AIProvider {
  name: string;
  model: string;
  resolveApiKey(): Promise<string | null>;
  streamChat(request: StreamRequest, signal: AbortSignal): Promise<ReadableStream<string>>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}
