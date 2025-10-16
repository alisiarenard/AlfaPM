import { log } from "./vite";
import { request } from "undici";

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

    const normalizedDomain = domain.replace(/^https?:\/\//, '');
    
    if (normalizedDomain.includes('.')) {
      this.baseUrl = `https://${normalizedDomain}/api/latest`;
    } else {
      this.baseUrl = `https://${normalizedDomain}.kaiten.io/api/latest`;
    }
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const { statusCode, body } = await request(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const responseText = await body.text();

    if (statusCode !== 200) {
      log(`[Kaiten API] Error ${statusCode}: ${responseText}`);
      throw new Error(`Kaiten API error: ${statusCode} - ${responseText}`);
    }

    return JSON.parse(responseText);
  }

  async getCard(cardId: number): Promise<KaitenCard> {
    log(`[Kaiten API] Fetching card ${cardId}`);
    return this.makeRequest<KaitenCard>(`/cards/${cardId}`);
  }

  async getCardsFromBoard(boardId: number): Promise<KaitenCard[]> {
    log(`[Kaiten API] Fetching cards from board ${boardId}`);
    const response = await this.makeRequest<KaitenCardListResponse>(`/cards?board_id=${boardId}`);
    return response.data || [];
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/spaces');
      log('[Kaiten API] Connection test successful');
      return true;
    } catch (error) {
      log(`[Kaiten API] Connection test failed: ${error}`);
      return false;
    }
  }
}

export const kaitenClient = new KaitenClient();
