/**
 * Конфигурация для формирования URL карточек Kaiten
 */

const getKaitenDomain = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_KAITEN_DOMAIN || 'feature.kaiten.ru';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env.KAITEN_DOMAIN || process.env.VITE_KAITEN_DOMAIN || 'feature.kaiten.ru';
  }
  return 'feature.kaiten.ru';
};

export const KAITEN_CONFIG = {
  get baseUrl() {
    return `https://${getKaitenDomain()}`;
  },
} as const;

/**
 * Формирует URL для открытия карточки в Kaiten
 * @param spaceId - ID пространства команды
 * @param cardId - ID карточки
 * @param archived - Признак архивации карточки
 * @returns Полный URL для открытия карточки
 */
export function getKaitenCardUrl(
  spaceId: number,
  cardId: number,
  archived: boolean = false
): string {
  const cardPath = archived ? 'archive/card' : 'boards/card';
  return `${KAITEN_CONFIG.baseUrl}/space/${spaceId}/${cardPath}/${cardId}`;
}
