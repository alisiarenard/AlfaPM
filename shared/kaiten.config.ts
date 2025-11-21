/**
 * Конфигурация для формирования URL карточек Kaiten
 */

// Получаем домен Kaiten из переменной окружения
// В бекенде используется process.env.KAITEN_DOMAIN
// Во фронтенде используется import.meta.env.VITE_KAITEN_DOMAIN
const getKaitenDomain = (): string => {
  // Проверяем наличие import.meta (работает только во фронтенде)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_KAITEN_DOMAIN || 'feature.kaiten.ru';
  }
  // Fallback для бекенда или если переменная не задана
  return 'feature.kaiten.ru';
};

export const KAITEN_CONFIG = {
  baseUrl: `https://${getKaitenDomain()}`,
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
