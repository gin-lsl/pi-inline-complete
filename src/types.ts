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

export interface PredictionRequest {
  beforeCursor: string;
  afterCursor: string;
  recentContext: string;
}

export interface PredictionService {
  complete(request: PredictionRequest, signal: AbortSignal): Promise<string | undefined>;
}
