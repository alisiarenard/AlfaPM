import { log } from "./vite";

export interface KaitenCard {
  id: number;
  title: string;
  board_id: number;
  column_id: number;
  lane_id: number;
  state: number;
  condition: number;
  size: number;
  archived: boolean;
}

export interface KaitenCardListResponse {
  data: KaitenCard[];
}

export class KaitenClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const domain = process.env.KAITEN_DOMAIN;
    const apiKey = process.env.KAITEN_API_KEY;

    if (!domain || !apiKey) {
      throw new Error("KAITEN_DOMAIN and KAITEN_API_KEY environment variables are required");
    }

    this.baseUrl = `https://${domain}.kaiten.io/api/latest`;
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[Kaiten API] Error ${response.status}: ${errorText}`);
      throw new Error(`Kaiten API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async getCard(cardId: number): Promise<KaitenCard> {
    log(`[Kaiten API] Fetching card ${cardId}`);
    return this.request<KaitenCard>(`/cards/${cardId}`);
  }

  async getCardsFromBoard(boardId: number): Promise<KaitenCard[]> {
    log(`[Kaiten API] Fetching cards from board ${boardId}`);
    const response = await this.request<KaitenCardListResponse>(`/cards?board_id=${boardId}`);
    return response.data || [];
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test API connection by making a simple request
      await this.request('/spaces');
      log('[Kaiten API] Connection test successful');
      return true;
    } catch (error) {
      log(`[Kaiten API] Connection test failed: ${error}`);
      return false;
    }
  }
}

export const kaitenClient = new KaitenClient();
