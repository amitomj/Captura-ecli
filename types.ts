
export interface Acordao {
  id: string; // Internal unique ID or ECLI
  ecli: string;
  relator: string;
  descritores: string[];
  processo: string;
  data: string;
  sumario: string;
  textoIntegral: string;
  adjuntos: string[];
  url: string;
  fileName?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ExtractionResult {
  success: boolean;
  data?: Partial<Acordao>;
  error?: string;
}
