
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface RuleFile {
  id: string;
  name: string;
  uploadedAt: number;
  content: string; // Extracted text content
  size: number;
}

export interface ChatHistoryItem {
  id: string;
  timestamp: number;
  query: string;
  response: string;
}

export interface Employee {
  code: string;
  name: string;
  department: string;
  role: string;
  rawInfo: string;
}

export type AppMode = 'user' | 'admin';

export interface AdminState {
  isAuthenticated: boolean;
  files: RuleFile[];
}

export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  isConnected: boolean;
  lastSync?: number;
}
