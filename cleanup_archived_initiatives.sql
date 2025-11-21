-- ============================================================
-- Скрипт для удаления архивных инициатив из локальной БД
-- ============================================================
-- 
-- Этот скрипт удаляет все инициативы со статусом "2-archived"
-- и перенаправляет связанные задачи на "Поддержку бизнеса" (init_card_id = 0)
--
-- ВНИМАНИЕ: Запускайте этот скрипт ЛОКАЛЬНО через psql или любой PostgreSQL клиент
-- ============================================================

BEGIN;

-- Шаг 1: Показываем статистику ДО очистки
SELECT 
  'BEFORE CLEANUP' as status,
  COUNT(*) as total_initiatives,
  SUM(CASE WHEN condition = '2-archived' THEN 1 ELSE 0 END) as archived_initiatives,
  SUM(CASE WHEN condition = '1-live' THEN 1 ELSE 0 END) as live_initiatives
FROM initiatives;

-- Шаг 2: Получаем card_id всех архивных инициатив
CREATE TEMP TABLE archived_card_ids AS
SELECT card_id FROM initiatives WHERE condition = '2-archived';

SELECT 
  'ARCHIVED INITIATIVES' as info,
  COUNT(*) as count,
  array_agg(card_id) as card_ids
FROM archived_card_ids;

-- Шаг 3: Проверяем, сколько задач ссылаются на архивные инициативы
SELECT 
  'TASKS LINKED TO ARCHIVED' as info,
  COUNT(*) as tasks_count
FROM tasks 
WHERE init_card_id IN (SELECT card_id FROM archived_card_ids);

-- Шаг 4: Перенаправляем задачи на "Поддержку бизнеса" (init_card_id = 0)
UPDATE tasks 
SET init_card_id = 0
WHERE init_card_id IN (SELECT card_id FROM archived_card_ids);

SELECT 
  'TASKS REDIRECTED' as status,
  COUNT(*) as redirected_to_business_support
FROM tasks 
WHERE init_card_id = 0;

-- Шаг 5: Удаляем архивные инициативы
DELETE FROM initiatives WHERE condition = '2-archived';

-- Шаг 6: Показываем статистику ПОСЛЕ очистки
SELECT 
  'AFTER CLEANUP' as status,
  COUNT(*) as total_initiatives,
  SUM(CASE WHEN condition = '2-archived' THEN 1 ELSE 0 END) as archived_initiatives,
  SUM(CASE WHEN condition = '1-live' THEN 1 ELSE 0 END) as live_initiatives
FROM initiatives;

-- Шаг 7: Очищаем временную таблицу
DROP TABLE archived_card_ids;

-- Если все выглядит правильно, раскомментируйте следующую строку:
COMMIT;

-- Если что-то пошло не так, раскомментируйте эту строку вместо COMMIT:
-- ROLLBACK;
