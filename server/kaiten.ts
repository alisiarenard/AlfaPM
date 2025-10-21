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
  sprint_id?: number | null;
  children?: KaitenCard[];
  created?: string;
  type_id?: number | null;
  type?: {
    id: number;
    name: string;
  } | null;
  completed_at?: string | null;
  parents_ids?: number[];
}

export interface KaitenCardListResponse {
  data: KaitenCard[];
}

export interface KaitenBoardResponse {
  id: number;
  title: string;
  cards?: KaitenCard[];
  [key: string]: any;
}

export interface KaitenSprintResponse {
  id: number;
  title: string;
  cards?: Array<{ id: number; [key: string]: any }>;
  [key: string]: any;
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
    log(`[Kaiten API] Fetching board ${boardId} using /api/latest/boards/${boardId}`);
    const response = await this.makeRequest<KaitenBoardResponse>(`/boards/${boardId}`);
    log(`[Kaiten API] Board response keys: ${Object.keys(response).join(', ')}`);
    log(`[Kaiten API] Raw response (first 800 chars): ${JSON.stringify(response).substring(0, 800)}`);
    
    // Try different possible card locations in response
    if (response.cards && Array.isArray(response.cards)) {
      log(`[Kaiten API] Found ${response.cards.length} cards in response.cards`);
      return response.cards;
    }
    
    // Check if response itself is an array
    if (Array.isArray(response)) {
      log(`[Kaiten API] Response is array with ${response.length} items`);
      return response as unknown as KaitenCard[];
    }
    
    log(`[Kaiten API] No cards found in response`);
    return [];
  }

  async getSprint(sprintId: number): Promise<KaitenSprintResponse> {
    log(`[Kaiten API] Fetching sprint ${sprintId}`);
    return this.makeRequest<KaitenSprintResponse>(`/sprints/${sprintId}`);
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

  async validateBoard(boardId: number, boardType: 'initiatives' | 'sprints' = 'initiatives'): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.makeRequest(`/boards/${boardId}`);
      log(`[Kaiten API] Board ${boardId} validated successfully`);
      return { valid: true };
    } catch (error: any) {
      log(`[Kaiten API] Failed to validate board ${boardId}:`, error);
      // Kaiten API returns 403 Forbidden for non-existent boards or boards without access
      if (error.message?.includes('403') || error.message?.includes('404') || error.message?.toLowerCase().includes('not found')) {
        const errorMessage = boardType === 'initiatives' 
          ? 'Доска инициатив с таким ID не найдена в Kaiten'
          : 'Доска спринтов с таким ID не найдена в Kaiten';
        return { valid: false, error: errorMessage };
      }
      return { valid: false, error: 'Ошибка при проверке доски в Kaiten' };
    }
  }
}

export const kaitenClient = new KaitenClient();
