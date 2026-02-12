import "dotenv/config";
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
  children_ids?: number[] | null;
  created?: string;
  type_id?: number | null;
  type?: {
    id: number;
    name: string;
  } | null;
  completed_at?: string | null;
  parents_ids?: number[];
  properties?: Record<string, any>;
  due_date?: string | null;
  last_moved_to_done_at?: string | null;
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

export interface KaitenSprintListItem {
  id: number;
  uid: string;
  board_id: number;
  title: string;
  goal: string | null;
  active: boolean;
  committed: number;
  velocity: number;
  velocity_details: {
    by_members: Array<{ user_id: number; velocity: number }>;
  } | null;
  start_date: string;
  finish_date: string;
  actual_finish_date: string | null;
  created: string;
  updated: string;
  archived: boolean;
}

export class KaitenClient {
  private baseUrl: string;
  private apiKey: string;
  private domain: string;

  constructor() {
    const domain = process.env.KAITEN_DOMAIN;
    const apiKey = process.env.KAITEN_API_KEY;

    if (!domain || !apiKey) {
      throw new Error("KAITEN_DOMAIN and KAITEN_API_KEY environment variables are required");
    }

    const normalizedDomain = domain.replace(/^https?:\/\//, '');
    this.domain = normalizedDomain;
    
    if (normalizedDomain.includes('.')) {
      this.baseUrl = `https://${normalizedDomain}/api/latest`;
    } else {
      this.baseUrl = `https://${normalizedDomain}.kaiten.io/api/latest`;
    }
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(endpoint: string, options?: {
    method?: string;
    body?: any;
  }): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    
    const { statusCode, body } = await request(url, {
      method: options?.method || 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const responseText = await body.text();
    

    if (statusCode !== 200) {
      throw new Error(`Kaiten API error: ${statusCode} - ${responseText}`);
    }

    return JSON.parse(responseText);
  }

  async getCard(cardId: number): Promise<KaitenCard> {
    return this.makeRequest<KaitenCard>(`/cards/${cardId}`);
  }

  async getCardsFromBoard(boardId: number): Promise<KaitenCard[]> {
    const response = await this.makeRequest<KaitenBoardResponse>(`/boards/${boardId}`);
    
    // Try different possible card locations in response
    if (response.cards && Array.isArray(response.cards)) {
      if (response.cards.length > 0) {
      }
      return response.cards;
    }
    
    // Check if response itself is an array
    if (Array.isArray(response)) {
      return response as unknown as KaitenCard[];
    }
    
    return [];
  }

  async getCardsWithDateFilter(params: {
    boardId: number;
    lastMovedToDoneAtAfter?: string;
    limit?: number;
    skip?: number;
  }): Promise<KaitenCard[]> {
    const queryParams = new URLSearchParams();
    queryParams.append('board_id', String(params.boardId));
    
    if (params.lastMovedToDoneAtAfter) {
      queryParams.append('last_moved_to_done_at_after', params.lastMovedToDoneAtAfter);
    }
    if (params.limit !== undefined) {
      queryParams.append('limit', String(params.limit));
    }
    if (params.skip !== undefined) {
      queryParams.append('skip', String(params.skip));
    }
    
    const url = `/cards?${queryParams.toString()}`;
    
    const response = await this.makeRequest<{ data?: KaitenCard[]; [key: string]: any }>(url);
    
    // Kaiten API returns an object wrapper: { data: [...], meta: {...} }
    if (response.data && Array.isArray(response.data)) {
      return response.data;
    }
    
    // Fallback: if response is directly an array
    if (Array.isArray(response)) {
      return response as unknown as KaitenCard[];
    }
    
    return [];
  }

  async getSprint(sprintId: number): Promise<KaitenSprintResponse> {
    return this.makeRequest<KaitenSprintResponse>(`/sprints/${sprintId}`);
  }

  async getSprintsFromBoard(boardId: number): Promise<KaitenSprintResponse[]> {
    const response = await this.makeRequest<KaitenBoardResponse>(`/boards/${boardId}`);
    
    if (response.sprints && Array.isArray(response.sprints)) {
      return response.sprints;
    }
    
    return [];
  }

  async getAllSprints(params?: { active?: boolean; limit?: number; offset?: number }): Promise<KaitenSprintListItem[]> {
    
    const queryParams = new URLSearchParams();
    if (params?.active !== undefined) {
      queryParams.append('active', String(params.active));
    }
    if (params?.limit !== undefined) {
      queryParams.append('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      queryParams.append('offset', String(params.offset));
    }
    
    const url = `/sprints${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await this.makeRequest<KaitenSprintListItem[]>(url);
    
    // Выводим полный ответ от Kaiten в лог
    
    if (Array.isArray(response)) {
      // Выводим каждый спринт с его данными
      response.forEach((sprint, index) => {
      });
      return response;
    }
    
    return [];
  }

  async getSpaceInfo(spaceId: number): Promise<{ id: number; title: string } | null> {
    try {
      const response = await this.makeRequest<{ id: number; title: string }>(`/spaces/${spaceId}`);
      return response;
    } catch (error) {
      log(`[Kaiten] Failed to get space info for ${spaceId}: ${error}`);
      return null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/spaces');
      log('[Kaiten API] Connection test successful');
      return true;
    } catch (error) {
      return false;
    }
  }

  async validateBoard(boardId: number, boardType: 'initiatives' | 'sprints' = 'initiatives'): Promise<{ valid: boolean; error?: string }> {
    try {
      const maskedKey = this.apiKey ? `${this.apiKey.slice(0, 4)}...${this.apiKey.slice(-4)}` : 'NOT SET';
      log(`[Kaiten] Validating board ${boardId} (type: ${boardType}), domain: ${this.domain}, baseUrl: ${this.baseUrl}, apiKey: ${maskedKey}`);
      await this.makeRequest(`/boards/${boardId}`);
      log(`[Kaiten] Board ${boardId} validation successful`);
      return { valid: true };
    } catch (error: any) {
      const maskedKey = this.apiKey ? `${this.apiKey.slice(0, 4)}...${this.apiKey.slice(-4)}` : 'NOT SET';
      log(`[Kaiten] Board ${boardId} validation failed: ${error.message || error}, domain: ${this.domain}, baseUrl: ${this.baseUrl}, apiKey: ${maskedKey}`);
      if (error.message?.includes('403') || error.message?.includes('404') || error.message?.toLowerCase().includes('not found')) {
        const errorMessage = boardType === 'initiatives' 
          ? 'Доска инициатив с таким ID не найдена в Kaiten'
          : 'Доска спринтов с таким ID не найдена в Kaiten';
        return { valid: false, error: errorMessage };
      }
      return { valid: false, error: `Ошибка при проверке доски в Kaiten: ${error.message || 'неизвестная ошибка'}` };
    }
  }

  async updateCard(cardId: number, updates: {
    size?: number;
    properties?: Record<string, any>;
  }): Promise<KaitenCard> {
    return this.makeRequest<KaitenCard>(`/cards/${cardId}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  async getBoardCardsFromSpace(spaceId: number, boardId: number): Promise<KaitenCard[]> {
    try {
      const response = await this.makeRequest<{ cards?: KaitenCard[]; [key: string]: any }>(`/spaces/${spaceId}/boards/${boardId}`);
      
      if (response.cards && Array.isArray(response.cards)) {
        return response.cards;
      }
      
      if (Array.isArray(response)) {
        return response as unknown as KaitenCard[];
      }
      
      return [];
    } catch (error) {
      console.error(`[Kaiten API] Error getting board cards from space ${spaceId}, board ${boardId}:`, error);
      throw error;
    }
  }
}

export const kaitenClient = new KaitenClient();
