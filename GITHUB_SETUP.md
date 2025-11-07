# Инструкция по настройке GitHub синхронизации

## Статус
✅ Git уже подключен к репозиторию: https://github.com/alisiarenard/AlfaPM  
✅ Все изменения автоматически коммитятся в Replit  
⚠️ Нужно настроить Push на GitHub

## Как отправить код на GitHub

### Шаг 1: Откройте обычный редактор Replit
1. В верхнем левом углу нажмите на меню (три линии или логотип)
2. Найдите "Open in workspace" или название проекта
3. Откроется обычный интерфейс редактора кода

### Шаг 2: Откройте Git панель
В обычном редакторе:
1. Слева найдите панель инструментов
2. Нажмите на иконку "+" или "Tools"
3. Выберите "Git" из списка

### Шаг 3: Push на GitHub
1. В Git панели вы увидите готовые коммиты
2. Нажмите кнопку "Push" или "Push to origin"
3. При запросе аутентификации:
   - Username: alisiarenard
   - Password: используйте Personal Access Token (см. ниже)

## Как создать Personal Access Token

1. Откройте https://github.com/settings/tokens
2. Нажмите "Generate new token" → "Generate new token (classic)"
3. Название: "Replit AlfaPM"
4. Срок: "No expiration" или "90 days"
5. Отметьте галочку "repo" (полный доступ к репозиториям)
6. Нажмите "Generate token"
7. ВАЖНО: Скопируйте токен сразу (показывается только один раз!)
8. Сохраните токен в надежном месте

## После настройки

После первого успешного Push все будет работать автоматически:
- Replit автоматически создает коммиты при изменениях
- Вам нужно только нажимать "Push" в Git панели
- Все изменения будут отправляться на GitHub

## Альтернативный способ (если Git панель не открывается)

Используйте Shell в обычном редакторе:
```bash
# Открыть Shell (в Tools → Shell)
git push -u origin main
```

При запросе пароля вставьте Personal Access Token.

---

**Текущие коммиты готовые к Push:**
- ✅ Enable pooled connections for the database
- ✅ Add project documentation (README.md)
- ✅ Make "Total" rows bold in Excel reports
- ✅ И другие изменения
