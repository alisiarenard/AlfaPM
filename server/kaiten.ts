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
      if (response.cards.length > 0) {
        log(`[Kaiten API] Sample card (first card):`, JSON.stringify(response.cards[0], null, 2));
      }
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
    log(`[Kaiten API] Fetching cards with query: ${url}`);
    
    const response = await this.makeRequest<KaitenCard[]>(url);
    
    if (Array.isArray(response)) {
      log(`[Kaiten API] Found ${response.length} cards`);
      return response;
    }
    
    log(`[Kaiten API] No cards found`);
    return [];
  }

  async getSprint(sprintId: number): Promise<KaitenSprintResponse> {
    log(`[Kaiten API] Fetching sprint ${sprintId}`);
    return this.makeRequest<KaitenSprintResponse>(`/sprints/${sprintId}`);
  }

  async getSprintsFromBoard(boardId: number): Promise<KaitenSprintResponse[]> {
    log(`[Kaiten API] Fetching sprints for board ${boardId}`);
    const response = await this.makeRequest<KaitenBoardResponse>(`/boards/${boardId}`);
    
    if (response.sprints && Array.isArray(response.sprints)) {
      log(`[Kaiten API] Found ${response.sprints.length} sprints in board ${boardId}`);
      return response.sprints;
    }
    
    log(`[Kaiten API] No sprints found in board ${boardId}`);
    return [];
  }

  async getAllSprints(params?: { active?: boolean; limit?: number; offset?: number }): Promise<KaitenSprintListItem[]> {
    log(`[Kaiten API] Fetching all sprints with params: ${JSON.stringify(params)}`);
    
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
    
    if (Array.isArray(response)) {
      log(`[Kaiten API] Found ${response.length} sprints`);
      return response;
    }
    
    log(`[Kaiten API] No sprints found`);
    return [];
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

  async updateCard(cardId: number, updates: {
    size?: number;
    properties?: Record<string, any>;
  }): Promise<KaitenCard> {
    log(`[Kaiten API] Updating card ${cardId} with:`, JSON.stringify(updates));
    return this.makeRequest<KaitenCard>(`/cards/${cardId}`, {
      method: 'PATCH',
      body: updates,
    });
  }
}

export const kaitenClient = new KaitenClient();
