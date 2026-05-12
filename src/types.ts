export interface CursorPosition {
  line: number;
  col: number;
}

export interface EditorSnapshot {
  text: string;
  cursor: CursorPosition;
  beforeCursor: string;
  afterCursor: string;
  key: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PredictionRequest {
  beforeCursor: string;
  afterCursor: string;
  recentContext: string;
  /** Structured conversation messages for chat-based APIs (e.g. DeepSeek chat_prefix_completion) */
  conversationMessages?: ChatMessage[];
}

export interface PredictionService {
  complete(request: PredictionRequest, signal: AbortSignal): Promise<string | undefined>;
}
