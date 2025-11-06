import { db } from "./db";
import { initiatives } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Инициализация базы данных
 * Создает запись "Поддержка бизнеса" если её нет
 */
export async function initializeDatabase() {
  try {
    // Проверяем, существует ли запись "Поддержка бизнеса" (cardId = 0)
    const existingBusinessSupport = await db
      .select()
      .from(initiatives)
      .where(eq(initiatives.cardId, 0))
      .limit(1);

    if (existingBusinessSupport.length === 0) {
      // Создаем запись "Поддержка бизнеса"
      await db.insert(initiatives).values({
        cardId: 0,
        title: "Поддержка бизнеса",
        state: "1-queued",
        condition: "1-live",
        type: "Card",
        initBoardId: 0,
        size: 0,
        plannedInvolvement: null,
        plannedValueId: null,
        plannedValue: null,
        factValueId: null,
        factValue: null,
        dueDate: null,
        doneDate: null,
      });

      console.log('[DB Init] Created default "Поддержка бизнеса" initiative');
    } else {
      console.log('[DB Init] "Поддержка бизнеса" initiative already exists');
    }
  } catch (error) {
    console.error("[DB Init] Error initializing database:", error);
    // Не бросаем ошибку, чтобы приложение могло запуститься даже если инициализация не удалась
  }
}
