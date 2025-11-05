/**
 * Конфигурация для формирования URL карточек Kaiten
 */

export const KAITEN_CONFIG = {
  baseUrl: 'https://feature.kaiten.ru',
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
