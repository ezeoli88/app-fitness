export type RestPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export type RestOpenData = {
  sessionId: number;
  dayId: number;
  id: string;
};

export interface RestAlerts {
  permission(): Promise<RestPermission>;
  requestPermission(): Promise<boolean>;
  schedule(timer: { sessionId: number; dayId: number; fireAt: number }): Promise<string | null>;
  cancel(id: string | null): Promise<void>;
  listScheduled(): Promise<{ id: string; sessionId: number }[]>;
  onOpen(cb: (data: RestOpenData) => void): () => void;
  buzz(): void;
  countdown(seconds: number | null): void;
}
