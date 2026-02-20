import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInitiativeSchema, insertTaskSchema, insertDepartmentSchema, type TaskRow } from "@shared/schema";
import { kaitenClient } from "./kaiten";
import { log } from "./vite";
import { calculateInitiativesInvolvement } from "./utils/involvement";

/**
 * Рекурсивно ищет инициативу в родительской цепочке карточки
 * @param parentCardId - ID родительской карточки
 * @param depth - глубина рекурсии (защита от бесконечных циклов)
 * @param originalTaskId - ID исходной задачи (для логирования)
 * @returns ID инициативы или 0, если не найдена
 */
async function findInitiativeInParentChain(parentCardId: number, depth = 0, originalTaskId?: number): Promise<number> {
  if (depth > 10) {
    return 0;
  }
  
  let lastFoundInitiativeId = 0;
  let currentCardId = parentCardId;
  
  for (let d = depth; d <= 10; d++) {
    const initiative = await storage.getInitiativeByCardId(currentCardId);
    if (initiative) {
      lastFoundInitiativeId = currentCardId;
    }
    
    try {
      const card = await kaitenClient.getCard(currentCardId);
      if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
        currentCardId = card.parents_ids[0];
      } else {
        break;
      }
    } catch (error) {
      break;
    }
  }
  
  return lastFoundInitiativeId;
}

/**
 * Фильтрует инициативы для timeline endpoint
 * Логика фильтрации:
 * 1. "Поддержка бизнеса" (cardId === 0) показываем всегда
 * 2. Не показываем архивные (condition === "2-archived")
 * 3. Показываем только Epic, Compliance, Enabler
 * 4. Если showActiveOnly - только state === "2-inProgress"
 * 5. Если done и totalSp === 0 - не показываем (inProgress всегда показываем)
 * 6. Фильтр по году (только для done): проверяем есть ли задачи с doneDate в выбранном году
 * 7. Queued инициативы показываем всегда (если не фильтр активных)
 */
function filterInitiativesForTimeline(
  initiatives: any[],
  year: number | null,
  showActiveOnly: boolean
): any[] {
  // Нормализация year - если NaN или невалидное значение, используем null
  const validYear = (year !== null && !isNaN(year) && year > 0) ? year : null;
  
  const filtered = initiatives.filter(init => {
    const isSupport = init.cardId === 0;
    if (isSupport) {
      return true;
    }
    
    if (init.condition === "2-archived") {
      return false;
    }
    
    if (init.type !== 'Epic' && init.type !== 'Compliance' && init.type !== 'Enabler') {
      return false;
    }
    
    if (showActiveOnly && init.state !== "2-inProgress") {
      return false;
    }
    
    if (init.state === "1-queued") {
      return true;
    }
    
    if (init.state === "2-inProgress") {
      return true;
    }
    
    if (init.state === "3-done") {
      const totalSp = init.sprints?.reduce((sum: number, sprint: any) => sum + sprint.sp, 0) || 0;
      
      if (totalSp === 0) {
        return false;
      }
      
      if (validYear) {
        const hasTasksInSelectedYear = init.sprints?.some((sprint: any) => 
          sprint.tasks?.some((task: any) => {
            if (!task.doneDate) return false;
            const taskYear = new Date(task.doneDate).getFullYear();
            return taskYear === validYear;
          })
        ) || false;
        
        if (!hasTasksInSelectedYear) {
          return false;
        }
      }
    }
    
    return true;
  });

  filtered.sort((a, b) => {
    const order = (init: any) => {
      if (init.cardId === 0) return 0;
      if (init.state === "2-inProgress") return 1;
      if (init.state === "3-done") return 2;
      if (init.state === "1-queued") return 3;
      return 4;
    };
    return order(a) - order(b);
  });

  return filtered;
}

async function buildSpPriceMap(allTeams: any[]): Promise<Map<string, Map<number, number>>> {
  const yearlyData = await storage.getAllTeamYearlyData();
  const map = new Map<string, Map<number, number>>();
  for (const row of yearlyData) {
    if (!map.has(row.teamId)) {
      map.set(row.teamId, new Map());
    }
    map.get(row.teamId)!.set(row.year, row.spPrice);
  }
  for (const team of allTeams) {
    if (!map.has(team.teamId)) {
      map.set(team.teamId, new Map());
    }
  }
  return map;
}

function getSpPriceForTask(
  spPriceMap: Map<string, Map<number, number>>,
  teamId: string | null,
  task: { doneDate?: string | null; completedAt?: string | null },
  fallbackSpPrice: number
): number {
  if (!teamId) return fallbackSpPrice;
  const yearMap = spPriceMap.get(teamId);
  if (!yearMap) return fallbackSpPrice;
  
  const dateStr = task.doneDate || task.completedAt;
  if (dateStr) {
    const year = new Date(dateStr).getFullYear();
    if (yearMap.has(year)) return yearMap.get(year)!;
  }
  return fallbackSpPrice;
}

function getSpPriceForYear(
  spPriceMap: Map<string, Map<number, number>>,
  teamId: string,
  year: number,
  fallbackSpPrice: number
): number {
  const yearMap = spPriceMap.get(teamId);
  if (yearMap && yearMap.has(year)) return yearMap.get(year)!;
  return fallbackSpPrice;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve departments" 
      });
    }
  });

  app.post("/api/departments", async (req, res) => {
    try {
      const validatedData = insertDepartmentSchema.parse(req.body);
      const department = await storage.createDepartment(validatedData);
      res.status(201).json(department);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.patch("/api/departments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "Request body cannot be empty" 
        });
      }
      
      const validatedData = insertDepartmentSchema.partial().parse(req.body);
      
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one field must be provided for update" 
        });
      }
      
      const department = await storage.updateDepartment(id, validatedData);
      
      if (!department) {
        return res.status(404).json({ 
          success: false, 
          error: "Department not found" 
        });
      }
      
      res.json(department);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.get("/api/teams/:departmentId", async (req, res) => {
    try {
      const { departmentId } = req.params;
      const teams = await storage.getTeamsByDepartment(departmentId);

      for (const team of teams) {
        if (!team.spaceName && team.spaceId) {
          const spaceInfo = await kaitenClient.getSpaceInfo(team.spaceId);
          if (spaceInfo) {
            team.spaceName = spaceInfo.title;
            await storage.updateTeam(team.teamId, { spaceName: spaceInfo.title });
          }
        }
        if (!team.initSpaceName && team.initSpaceId) {
          const spaceInfo = await kaitenClient.getSpaceInfo(team.initSpaceId);
          if (spaceInfo) {
            team.initSpaceName = spaceInfo.title;
            await storage.updateTeam(team.teamId, { initSpaceName: spaceInfo.title });
          }
        }
      }

      res.json(teams);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve teams" 
      });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const teamData = req.body;
      
      // Валидация initBoardId через Kaiten API
      if (teamData.initBoardId) {
        const initBoardValidation = await kaitenClient.validateBoard(teamData.initBoardId, 'initiatives');
        if (!initBoardValidation.valid) {
          return res.status(400).json({ 
            success: false, 
            error: initBoardValidation.error || "Доска инициатив не найдена в Kaiten"
          });
        }
      }

      // Запрашиваем название пространства из Kaiten
      if (teamData.spaceId) {
        const spaceInfo = await kaitenClient.getSpaceInfo(teamData.spaceId);
        if (spaceInfo) {
          teamData.spaceName = spaceInfo.title;
        }
      }

      if (teamData.initSpaceId) {
        const spaceInfo = await kaitenClient.getSpaceInfo(teamData.initSpaceId);
        if (spaceInfo) {
          teamData.initSpaceName = spaceInfo.title;
        }
      }
      
      // Создаем команду в БД
      const team = await storage.createTeam(teamData);
      
      // Автоматическая синхронизация данных с Kaiten
      // Последовательность: 1) Инициативы, 2) Спринты, 3) Таски
      
      // 1. Синхронизация инициатив
      if (teamData.initBoardId) {
        try {
          
          const allCards = await kaitenClient.getCardsFromBoard(teamData.initBoardId);
          
          // Фильтруем: сохраняем только неархивные инициативы
          const cards = allCards.filter(card => !card.archived);
          
          
          const plannedValueId = "id_237";
          const factValueId = "id_238";
          const syncedCardIds: number[] = [];
          
          for (const card of cards) {
            let state: "1-queued" | "2-inProgress" | "3-done";
            
            if (card.state === 3) {
              state = "3-done";
            } else if (card.state === 2) {
              state = "2-inProgress";
            } else {
              state = "1-queued";
            }
            
            const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
            
            const rawPlanned = card.properties?.[plannedValueId];
            const plannedValue = rawPlanned == null ? undefined : String(rawPlanned);
            
            const rawFact = card.properties?.[factValueId];
            const factValue = rawFact == null ? undefined : String(rawFact);
            
            await storage.syncInitiativeFromKaiten(
              card.id,
              teamData.initBoardId,
              card.title,
              state,
              condition,
              card.size || 0,
              card.type?.name,
              plannedValueId,
              plannedValue,
              factValueId,
              factValue,
              card.due_date || null,
              card.last_moved_to_done_at || null
            );
            syncedCardIds.push(card.id);
          }
          
          // Архивируем инициативы, которых больше нет на доске
          await storage.archiveInitiativesNotInList(teamData.initBoardId, syncedCardIds);
          
        } catch (syncError) {
        }
      }
      
      // 2. Синхронизация спринтов и задач
      // Логика зависит от состояния hasSprints:
      // - Если hasSprints === true: синхронизируем реальные спринты и их задачи
      // - Если hasSprints === false: синхронизируем только задачи через date filter (виртуальные спринты создадутся автоматически)
      
      if (teamData.hasSprints && teamData.sprintIds) {
        // РЕЖИМ: Реальные спринты
        try {
          
          // Парсим sprint IDs из строки (разделитель - запятая)
          const sprintIdArray = teamData.sprintIds
            .split(',')
            .map((id: string) => id.trim())
            .filter((id: string) => id.length > 0)
            .map((id: string) => parseInt(id))
            .filter((id: number) => !isNaN(id));
          
          
          // Получаем summary каждого спринта через getSprint API
          const syncedSprints: any[] = [];
          
          for (const sprintId of sprintIdArray) {
            try {
              const sprint = await kaitenClient.getSprint(sprintId);
              
              // Сохраняем спринт в БД
              await storage.syncSprintFromKaiten(
                sprint.id,
                sprint.board_id,
                sprint.title,
                sprint.velocity,
                sprint.start_date,
                sprint.finish_date,
                sprint.actual_finish_date,
                sprint.goal
              );
              
              syncedSprints.push(sprint);
            } catch (sprintError: unknown) {
              const errorMessage = sprintError instanceof Error ? sprintError.message : String(sprintError);
            }
          }
          
          
          // 3. Синхронизация тасок из реальных спринтов
          let totalTasks = 0;
          
          if (syncedSprints.length > 0) {
            // Есть спринты - синхронизируем задачи из них
            for (const sprint of syncedSprints) {
              try {
                const kaitenSprint = await kaitenClient.getSprint(sprint.id);
                
                if (kaitenSprint.cards && Array.isArray(kaitenSprint.cards)) {
                  for (const sprintCard of kaitenSprint.cards) {
                    const card = await kaitenClient.getCard(sprintCard.id);
                    
                    // Пропускаем удаленные карточки (condition === 3)
                    if (card.condition === 3) {
                      continue;
                    }
                    
                    // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
                    let initCardId = 0;
                    if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
                      initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
                    }
                    
                    let state: "1-queued" | "2-inProgress" | "3-done";
                    if (card.state === 3) {
                      state = "3-done";
                    } else if (card.state === 2) {
                      state = "2-inProgress";
                    } else {
                      state = "1-queued";
                    }
                    
                    const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
                    
                    await storage.syncTaskFromKaiten(
                      card.id,
                      card.board_id,
                      card.title,
                      card.created || new Date().toISOString(),
                      state,
                      card.size || 0,
                      condition,
                      card.archived || false,
                      initCardId,
                      card.type?.name,
                      card.completed_at ?? undefined,
                      sprint.id,
                      card.last_moved_to_done_at ?? null,
                      team.teamId
                    );
                    
                    totalTasks++;
                  }
                }
              } catch (sprintError: unknown) {
                const errorMessage = sprintError instanceof Error ? sprintError.message : String(sprintError);
              }
            }
          }
        } catch (syncError) {
        }
      } else if (teamData.initBoardId) {
        // РЕЖИМ: Виртуальные спринты (hasSprints === false)
        // Синхронизируем дочерние карточки инициатив (children)
        // Виртуальные спринты создадутся автоматически в /api/timeline на основе sprintDuration
        try {
          
          // Получаем все инициативы, которые были синхронизированы на шаге 1
          const initiatives = await storage.getInitiativesByBoardId(teamData.initBoardId);
          
          let totalTasks = 0;
          
          // Для каждой инициативы синхронизируем её дочерние карточки
          for (const initiative of initiatives) {
            try {
              // Получаем полную карточку инициативы из Kaiten для доступа к children_ids
              const initiativeCard = await kaitenClient.getCard(initiative.cardId);
              
              if (initiativeCard.children_ids && Array.isArray(initiativeCard.children_ids) && initiativeCard.children_ids.length > 0) {
                
                // Синхронизируем каждую дочернюю карточку
                for (const childId of initiativeCard.children_ids) {
                  try {
                    const childCard = await kaitenClient.getCard(childId);
                    
                    // Пропускаем архивные
                    if (childCard.archived) {
                      continue;
                    }
                    
                    // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
                    let initCardId = initiative.cardId; // По умолчанию - родительская инициатива
                    if (childCard.parents_ids && Array.isArray(childCard.parents_ids) && childCard.parents_ids.length > 0) {
                      // Если у дочерней карточки есть parents_ids, ищем инициативу через цепочку
                      const foundInitCardId = await findInitiativeInParentChain(childCard.parents_ids[0]);
                      if (foundInitCardId !== 0) {
                        initCardId = foundInitCardId;
                      }
                    }
                    
                    let state: "1-queued" | "2-inProgress" | "3-done";
                    if (childCard.state === 3) {
                      state = "3-done";
                    } else if (childCard.state === 2) {
                      state = "2-inProgress";
                    } else {
                      state = "1-queued";
                    }
                    
                    const condition: "1-live" | "2-archived" = childCard.archived ? "2-archived" : "1-live";
                    
                    await storage.syncTaskFromKaiten(
                      childCard.id,
                      childCard.board_id,
                      childCard.title,
                      childCard.created || new Date().toISOString(),
                      state,
                      childCard.size || 0,
                      condition,
                      childCard.archived || false,
                      initCardId, // Используем найденную инициативу
                      childCard.type?.name,
                      childCard.completed_at ?? undefined,
                      null, // Нет sprint_id для виртуальных спринтов
                      childCard.last_moved_to_done_at,
                      team.teamId
                    );
                    
                    totalTasks++;
                  } catch (childError: unknown) {
                    const errorMessage = childError instanceof Error ? childError.message : String(childError);
                  }
                }
              }
            } catch (initError: unknown) {
              const errorMessage = initError instanceof Error ? initError.message : String(initError);
            }
          }
          
        } catch (syncError) {
        }
      }
      
      res.json(team);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.patch("/api/teams/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      const updateData = req.body;

      const currentTeam = updateData.initBoardId !== undefined || updateData.sprintBoardId !== undefined || updateData.initSpaceId !== undefined
        ? await storage.getTeamById(teamId)
        : null;

      // Если изменяется initBoardId, проверяем его в Kaiten только если значение действительно изменилось
      if (updateData.initBoardId !== undefined) {
        // Валидируем только если ID доски действительно изменился
        if (!currentTeam || currentTeam.initBoardId !== updateData.initBoardId) {
          const validation = await kaitenClient.validateBoard(updateData.initBoardId, 'initiatives');
          if (!validation.valid) {
            return res.status(400).json({ 
              success: false, 
              error: validation.error || "Доска инициатив не найдена в Kaiten"
            });
          }
        }
      }

      // Если изменяется sprintBoardId, проверяем его в Kaiten только если значение действительно изменилось
      if (updateData.sprintBoardId !== undefined) {
        // Валидируем только если ID доски действительно изменился
        if (!currentTeam || currentTeam.sprintBoardId !== updateData.sprintBoardId) {
          const validation = await kaitenClient.validateBoard(updateData.sprintBoardId, 'sprints');
          if (!validation.valid) {
            return res.status(400).json({ 
              success: false, 
              error: validation.error || "Доска спринтов не найдена в Kaiten"
            });
          }
        }
      }

      // Запрашиваем название пространства из Kaiten если spaceId изменился
      if (updateData.spaceId !== undefined) {
        if (!currentTeam || currentTeam.spaceId !== updateData.spaceId) {
          const spaceInfo = await kaitenClient.getSpaceInfo(updateData.spaceId);
          if (spaceInfo) {
            updateData.spaceName = spaceInfo.title;
          }
        }
      }

      if (updateData.initSpaceId !== undefined) {
        if (!currentTeam || currentTeam.initSpaceId !== updateData.initSpaceId) {
          const spaceInfo = await kaitenClient.getSpaceInfo(updateData.initSpaceId);
          if (spaceInfo) {
            updateData.initSpaceName = spaceInfo.title;
          }
        }
      }

      const team = await storage.updateTeam(teamId, updateData);
      
      if (!team) {
        return res.status(404).json({ 
          success: false, 
          error: "Team not found" 
        });
      }
      
      res.json(team);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.delete("/api/teams/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      
      await storage.deleteTeam(teamId);
      
      res.json({ success: true });
    } catch (error) {
      
      if (error instanceof Error && error.message === "Team not found") {
        return res.status(404).json({ 
          success: false, 
          error: "Team not found" 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.get("/api/team-yearly-data/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      const year = req.query.year ? parseInt(req.query.year as string) : null;
      if (year) {
        const data = await storage.getTeamYearlyData(teamId, year);
        return res.json(data || null);
      }
      const allData = await storage.getTeamYearlyDataAll(teamId);
      res.json(allData);
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to get team yearly data" });
    }
  });

  app.post("/api/team-yearly-data", async (req, res) => {
    try {
      const { teamId, year, vilocity, sprintDuration, spPrice, hasSprints, plannedIr } = req.body;
      if (!teamId || !year || vilocity === undefined || sprintDuration === undefined) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }
      const result = await storage.upsertTeamYearlyData({
        teamId,
        year: parseInt(year),
        vilocity: parseFloat(vilocity),
        sprintDuration: parseInt(sprintDuration),
        spPrice: parseInt(spPrice) || 0,
        hasSprints: hasSprints !== undefined ? hasSprints : true,
        plannedIr: plannedIr !== undefined && plannedIr !== null && plannedIr !== '' ? parseInt(plannedIr) : null,
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to save team yearly data" });
    }
  });

  app.get("/api/initiatives", async (req, res) => {
    try {
      const initiatives = await storage.getAllInitiatives();
      res.json(initiatives);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve initiatives" 
      });
    }
  });

  app.get("/api/initiatives/board/:initBoardId", async (req, res) => {
    try {
      const initBoardId = parseInt(req.params.initBoardId);
      const sprintBoardId = req.query.sprintBoardId ? parseInt(req.query.sprintBoardId as string) : null;
      const teamId = req.query.teamId as string | null;
      const year = req.query.year ? parseInt(req.query.year as string) : null;
      const forReport = req.query.forReport === 'true';
      
      if (isNaN(initBoardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }
      
      const initiatives = await storage.getInitiativesByBoardId(initBoardId);
      
      // Если передан sprintBoardId, получаем sprint_id спринтов этой команды
      // Если передан year, фильтруем спринты по году (как в cost-structure)
      let teamSprintIds: Set<number> | null = null;
      let teamSprints: any[] = [];
      if (sprintBoardId !== null && !isNaN(sprintBoardId)) {
        let allTeamSprints = await storage.getSprintsByBoardId(sprintBoardId);
        
        // Фильтруем спринты по году, если указан (как в cost-structure API)
        if (year) {
          const yearStart = new Date(year, 0, 1);
          const yearEnd = new Date(year, 11, 31, 23, 59, 59);
          teamSprints = allTeamSprints.filter(sprint => {
            const sprintStart = new Date(sprint.startDate);
            return sprintStart >= yearStart && sprintStart <= yearEnd;
          });
        } else {
          teamSprints = allTeamSprints;
        }
        
        teamSprintIds = new Set(teamSprints.map(s => s.sprintId));
      }
      
      // Добавляем массив sprints для каждой инициативы
      const initiativesWithSprints = await Promise.all(
        initiatives.map(async (initiative) => {
          // Получаем все таски для данной инициативы
          const allTasks = await storage.getTasksByInitCardId(initiative.cardId);
          
          // Фильтруем задачи:
          // 1. По спринтам команды (если указан sprintBoardId)
          // 2. По teamId (если указан) - для соответствия логике cost-structure
          let tasks = allTasks;
          if (teamSprintIds) {
            tasks = tasks.filter(task => task.sprintId !== null && teamSprintIds!.has(task.sprintId));
          }
          if (teamId) {
            tasks = tasks.filter(task => task.teamId === teamId);
          }
          
          // Группируем по sprint_id и собираем задачи
          const sprintsMap = new Map<number, { sp: number; tasks: any[] }>();
          
          // Кэш для спринтов чтобы не запрашивать дважды
          const sprintInfoCache = new Map<number, any>();
          
          for (const task of tasks) {
            if (task.sprintId !== null) {
              const current = sprintsMap.get(task.sprintId) || { sp: 0, tasks: [] };
              
              // Получаем инфо о спринте (сначала из teamSprints, потом из БД если нужно)
              let sprintInfo = teamSprints.find(s => s.sprintId === task.sprintId);
              
              // Если спринт не в teamSprints, получаем из БД
              if (!sprintInfo && !sprintInfoCache.has(task.sprintId)) {
                sprintInfo = await storage.getSprint(task.sprintId);
                if (sprintInfo) {
                  sprintInfoCache.set(task.sprintId, sprintInfo);
                }
              } else if (!sprintInfo && sprintInfoCache.has(task.sprintId)) {
                sprintInfo = sprintInfoCache.get(task.sprintId);
              }
              
              // Считаем SP только для done-задач (как в cost-structure API)
              let countSP = false;
              if (task.state === '3-done' && task.condition !== '3 - deleted') {
                countSP = true;
              }
              
              console.log(`[Timeline SP] Init: ${initiative.cardId}, Task: ${task.id}, Sprint: ${task.sprintId}, Size: ${task.size}, DoneDate: ${task.doneDate}, CountSP: ${countSP}, SprintInfo: ${sprintInfo ? 'Found' : 'NOT FOUND'}`);
              
              if (countSP) {
                current.sp += task.size;
              }
              
              current.tasks.push({
                id: task.id,
                cardId: task.cardId,
                title: task.title,
                type: task.type,
                size: task.size,
                state: task.state,
                condition: task.condition,
                archived: task.archived,
                doneDate: task.doneDate
              });
              sprintsMap.set(task.sprintId, current);
            }
          }
          
          // Преобразуем в массив объектов {sprint_id, sp, tasks}
          const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
            sprint_id,
            sp: data.sp,
            tasks: data.tasks
          }));
          
          return {
            ...initiative,
            sprints
          };
        })
      );
      
      // Если указан sprintBoardId - фильтруем только инициативы с задачами в спринтах команды
      // Инициативы в очереди показываем всегда
      const filteredInitiatives = teamSprintIds
        ? initiativesWithSprints.filter(init => {
            const hasSprints = init.sprints.length > 0;
            const isSupport = init.cardId === 0;
            const isQueued = init.state === "1-queued";
            const pass = hasSprints || isSupport || isQueued;
            
            if (isQueued) {
            }
            
            return pass;
          })
        : initiativesWithSprints;
      
      // Рассчитываем involvement для каждой инициативы
      const sprintPeriods = new Map(
        teamSprints.map(s => [s.sprintId, { 
          startDate: new Date(s.startDate),
          finishDate: new Date(s.finishDate)
        }])
      );
      
      const initiativesWithInvolvement = calculateInitiativesInvolvement(filteredInitiatives, sprintPeriods);
      
      // Фильтрация для Excel отчетов (forReport=true)
      // 1. Исключаем "Поддержка бизнеса" (cardId === 0)
      // 2. Показываем только инициативы в статусе "done" (state === "3-done")
      // 3. Показываем только Epic, Compliance, Enabler
      const result = forReport
        ? initiativesWithInvolvement.filter((init: any) => {
            if (init.cardId === 0) return false;
            if (init.state !== "3-done") return false;
            if (init.type !== 'Epic' && init.type !== 'Compliance' && init.type !== 'Enabler') return false;
            return true;
          })
        : initiativesWithInvolvement;
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve initiatives" 
      });
    }
  });

  app.get("/api/timeline/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      // Получаем параметры фильтрации из query string
      const year = req.query.year ? parseInt(req.query.year as string) : null;
      const showActiveOnly = req.query.showActiveOnly === 'true';
      
      console.log(`[TIMELINE] Fetching timeline for team ${teamId}, year=${year}, showActiveOnly=${showActiveOnly}`);
      
      const team = await storage.getTeamById(teamId);
      
      if (!team) {
        return res.status(404).json({ 
          success: false, 
          error: "Team not found" 
        });
      }

      const initBoardId = team.initBoardId;
      const sprintBoardId = team.sprintBoardId;
      const sprintDuration = team.sprintDuration || 14; // Default to 14 days if not set

      if (!initBoardId) {
        return res.status(400).json({ 
          success: false, 
          error: "Team missing initBoardId" 
        });
      }


      // Получаем инициативы
      let initiatives = await storage.getInitiativesByBoardId(initBoardId);
      
      // Добавляем "Поддержка бизнеса" (cardId=0) если её нет
      const hasBusinessSupport = initiatives.some(init => init.cardId === 0);
      if (!hasBusinessSupport) {
        const businessSupport = await storage.getInitiativeByCardId(0);
        if (businessSupport) {
          initiatives = [businessSupport, ...initiatives];
        }
      }
      
      // Фильтруем инициативы - показываем только Epic, Compliance, Enabler и "Поддержка бизнеса"
      const allInitiatives = [...initiatives];
      initiatives = initiatives.filter(init => 
        init.cardId === 0 || init.type === 'Epic' || init.type === 'Compliance' || init.type === 'Enabler'
      );

      // Загружаем все задачи один раз (избегаем N+1)
      // Используем allInitiatives для загрузки задач (включая задачи из других типов)
      const allInitiativeCardIds = new Set(allInitiatives.map(i => i.cardId));
      const allTasks = await storage.getAllTasks();
      // Фильтруем задачи по teamId чтобы показывать только задачи этой команды
      let initiativeTasks = allTasks.filter(task => 
        task.initCardId !== null && 
        allInitiativeCardIds.has(task.initCardId) &&
        task.teamId === teamId
      );
      
      // Создаем Map для быстрого поиска типа инициативы по cardId
      const initiativeTypeMap = new Map(allInitiatives.map(init => [init.cardId, init.type]));
      
      // Перенаправляем задачи из инициатив других типов (не Epic, Compliance и не Enabler) в "Поддержку бизнеса"
      initiativeTasks = initiativeTasks.map(task => {
        const initType = initiativeTypeMap.get(task.initCardId || 0);
        // Если инициатива не Epic, не Compliance, не Enabler и не "Поддержка бизнеса" (cardId=0), перенаправляем в "Поддержку бизнеса"
        if (task.initCardId !== 0 && initType !== 'Epic' && initType !== 'Compliance' && initType !== 'Enabler') {
          // ВАЖНО: Сохраняем тип инициативы в task.type для правильного подсчета в Cost Structure
          return { ...task, initCardId: 0, type: initType || task.type };
        }
        return task;
      });

      // Логика зависит от флага hasSprints:
      // - Если hasSprints === true: используем реальные спринты из БД
      // - Если hasSprints === false: создаём виртуальные спринты на основе sprintDuration
      
      if (team.hasSprints && sprintBoardId) {
        // РЕЖИМ: Реальные спринты
        const teamSprints = await storage.getSprintsByBoardId(sprintBoardId);
        const teamSprintIds = new Set(teamSprints.map(s => s.sprintId));

        // Если спринтов нет в БД - возвращаем пустой результат с предупреждением
        if (teamSprints.length === 0) {

          // Фильтруем задачи с doneDate
          const tasksForVirtual = initiativeTasks.filter(task => 
            task.doneDate !== null && 
            task.doneDate !== ''
          );


          if (tasksForVirtual.length === 0) {
            // Нет задач - возвращаем пустые спринты
            const initiativesWithEmpty = initiatives.map(init => ({
              ...init,
              sprints: [],
              involvement: null
            }));
            // Применяем фильтрацию по году и активности
            const finalInitiatives = filterInitiativesForTimeline(initiativesWithEmpty, year, showActiveOnly);
            return res.json({ initiatives: finalInitiatives, sprints: [] });
          }

          // Создаём виртуальные спринты (копия логики из else ветки)
          const sortedTasks = tasksForVirtual.sort((a, b) => {
            const dateA = new Date(a.doneDate!);
            const dateB = new Date(b.doneDate!);
            return dateA.getTime() - dateB.getTime();
          });

          const firstDate = new Date(sortedTasks[0].doneDate!);
          const lastDate = new Date(sortedTasks[sortedTasks.length - 1].doneDate!);

          const virtualSprints: any[] = [];
          const virtualSprintTasksMap = new Map<number, any[]>();
          let currentStartDate = new Date(firstDate);
          let sprintNumber = 1;

          while (currentStartDate <= lastDate) {
            const currentEndDate = new Date(currentStartDate);
            currentEndDate.setDate(currentEndDate.getDate() + sprintDuration - 1);

            const sprintTasks = sortedTasks.filter(task => {
              const taskDate = new Date(task.doneDate!);
              return taskDate >= currentStartDate && taskDate <= currentEndDate;
            });

            if (sprintTasks.length > 0) {
              const virtualSprintId = -sprintNumber;
              virtualSprints.push({
                sprintId: virtualSprintId,
                boardId: sprintBoardId,
                title: `Виртуальный спринт ${sprintNumber}`,
                velocity: 0,
                startDate: currentStartDate.toISOString(),
                finishDate: currentEndDate.toISOString(),
                actualFinishDate: null,
                goal: null,
                isVirtual: true
              });
              virtualSprintTasksMap.set(virtualSprintId, sprintTasks);
              sprintNumber++;
            }

            currentStartDate = new Date(currentEndDate);
            currentStartDate.setDate(currentStartDate.getDate() + 1);
          }

          // Группируем задачи по инициативам
          const tasksByInitiative = new Map<number, any[]>();
          tasksForVirtual.forEach(task => {
            if (task.initCardId !== null) {
              if (!tasksByInitiative.has(task.initCardId)) {
                tasksByInitiative.set(task.initCardId, []);
              }
              tasksByInitiative.get(task.initCardId)!.push(task);
            }
          });

          const initiativesWithVirtualSprints = initiatives.map(initiative => {
            const tasks = tasksByInitiative.get(initiative.cardId) || [];

            const sprintsMap = new Map<number, { sp: number; tasks: any[] }>();
            tasks.forEach(task => {
              const taskDate = new Date(task.doneDate!);
              const virtualSprint = virtualSprints.find(vs => {
                const start = new Date(vs.startDate);
                const end = new Date(vs.finishDate);
                return taskDate >= start && taskDate <= end;
              });

              if (virtualSprint) {
                const current = sprintsMap.get(virtualSprint.sprintId) || { sp: 0, tasks: [] };
                // Считаем SP только для done-задач (как в cost-structure)
                if (task.state === '3-done' && task.condition !== '3 - deleted') {
                  current.sp += task.size;
                }
                current.tasks.push({
                  id: task.id,
                  cardId: task.cardId,
                  title: task.title,
                  type: task.type,
                  size: task.size,
                  state: task.state,
                  condition: task.condition,
                  archived: task.archived,
                  doneDate: task.doneDate
                });
                sprintsMap.set(virtualSprint.sprintId, current);
              }
            });

            const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
              sprint_id,
              sp: data.sp,
              tasks: data.tasks
            }));

            return {
              ...initiative,
              sprints,
              involvement: null
            };
          });

          const filteredInitiatives = initiativesWithVirtualSprints.filter(init => {
            const hasSprints = init.sprints.length > 0;
            const isSupport = init.cardId === 0;
            const isQueued = init.state === "1-queued";
            return hasSprints || isSupport || isQueued;
          });

          // Рассчитываем involvement для виртуальных спринтов
          const sprintPeriods = new Map(
            virtualSprints.map(s => [s.sprintId, { 
              startDate: new Date(s.startDate),
              finishDate: new Date(s.finishDate)
            }])
          );
          
          const initiativesWithInvolvement = calculateInitiativesInvolvement(filteredInitiatives, sprintPeriods);
          
          // Применяем фильтрацию по году и активности
          const finalInitiatives = filterInitiativesForTimeline(initiativesWithInvolvement, year, showActiveOnly);

          return res.json({ initiatives: finalInitiatives, sprints: virtualSprints });
        }

        // Группируем задачи по инициативам в памяти
        const tasksByInitiative = new Map<number, any[]>();
        initiativeTasks
          .filter(task => task.sprintId !== null && teamSprintIds.has(task.sprintId) && task.initCardId !== null)
          .forEach(task => {
            if (!tasksByInitiative.has(task.initCardId!)) {
              tasksByInitiative.set(task.initCardId!, []);
            }
            tasksByInitiative.get(task.initCardId!)!.push(task);
          });

        // Добавляем спринты для каждой инициативы
        const initiativesWithSprints = initiatives.map(initiative => {
          const tasks = tasksByInitiative.get(initiative.cardId) || [];

          const sprintsMap = new Map<number, { sp: number; tasks: any[] }>();
          tasks.forEach(task => {
            if (task.sprintId !== null) {
              const sprintInfo = teamSprints.find(s => s.sprintId === task.sprintId);
              const current = sprintsMap.get(task.sprintId) || { sp: 0, tasks: [] };
              
              // Считаем SP только для done-задач (как в cost-structure и initiatives/board)
              let countSP = false;
              if (task.state === '3-done' && task.condition !== '3 - deleted') {
                countSP = true;
              }
              
              if (countSP) {
                current.sp += task.size;
              }
              
              current.tasks.push({
                id: task.id,
                cardId: task.cardId,
                title: task.title,
                type: task.type,
                size: task.size,
                state: task.state,
                condition: task.condition,
                archived: task.archived,
                doneDate: task.doneDate
              });
              sprintsMap.set(task.sprintId, current);
            }
          });

          const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
            sprint_id,
            sp: data.sp,
            tasks: data.tasks
          }));

          return {
            ...initiative,
            sprints,
            involvement: null
          };
        });

        // Фильтруем инициативы (с задачами, поддержка бизнеса, или в очереди)
        const filteredInitiatives = initiativesWithSprints.filter(init => {
          const hasSprints = init.sprints.length > 0;
          const isSupport = init.cardId === 0;
          const isQueued = init.state === "1-queued";
          return hasSprints || isSupport || isQueued;
        });

        // Рассчитываем involvement для реальных спринтов
        const sprintPeriods = new Map(
          teamSprints.map(s => [s.sprintId, { 
            startDate: new Date(s.startDate),
            finishDate: new Date(s.finishDate)
          }])
        );
        
        const initiativesWithInvolvement = calculateInitiativesInvolvement(filteredInitiatives, sprintPeriods);
        
        // Применяем фильтрацию по году и активности
        const finalInitiatives = filterInitiativesForTimeline(initiativesWithInvolvement, year, showActiveOnly);

        // Рассчитываем разбивку SP по командам для каждой инициативы
        const allTeams = await storage.getAllTeams();
        const spPriceMap = await buildSpPriceMap(allTeams);
        const teamInfoMap = new Map(allTeams.map(t => [t.teamId, { name: t.teamName, spPrice: t.spPrice || 0 }]));
        const crossTeamTasks = allTasks.filter(task =>
          task.initCardId !== null &&
          allInitiativeCardIds.has(task.initCardId) &&
          task.state === '3-done' &&
          task.condition !== '3 - deleted'
        );
        const teamBreakdownByInit = new Map<number, Record<string, number>>();
        const totalDoneSPByInit = new Map<number, number>();
        crossTeamTasks.forEach(task => {
          const initId = task.initCardId!;
          if (!teamBreakdownByInit.has(initId)) {
            teamBreakdownByInit.set(initId, {});
          }
          const breakdown = teamBreakdownByInit.get(initId)!;
          const info = task.teamId ? teamInfoMap.get(task.teamId) : null;
          const tName = info?.name || 'Без команды';
          const spPrice = getSpPriceForTask(spPriceMap, task.teamId, task, info?.spPrice || 0);
          const cost = task.size * spPrice;
          breakdown[tName] = (breakdown[tName] || 0) + cost;
          totalDoneSPByInit.set(initId, (totalDoneSPByInit.get(initId) || 0) + task.size);
        });
        const finalWithBreakdown = finalInitiatives.map((init: any) => ({
          ...init,
          teamBreakdown: teamBreakdownByInit.get(init.cardId) || {},
          totalDoneSP: totalDoneSPByInit.get(init.cardId) || 0
        }));

        res.json({ initiatives: finalWithBreakdown, sprints: teamSprints });
      } else {
        // РЕЖИМ: Виртуальные спринты (hasSprints === false)
        // Создаём виртуальные спринты на основе sprintDuration

        // Фильтруем задачи с doneDate (для виртуальных спринтов берём ВСЕ задачи с датой закрытия)
        const tasksForVirtual = initiativeTasks.filter(task => 
          task.doneDate !== null && 
          task.doneDate !== ''
        );


        if (tasksForVirtual.length === 0) {
          // Нет задач - возвращаем пустые спринты
          const initiativesWithEmpty = initiatives.map(init => ({
            ...init,
            sprints: [],
            involvement: null
          }));
          // Применяем фильтрацию по году и активности
          const finalInitiatives = filterInitiativesForTimeline(initiativesWithEmpty, year, showActiveOnly);
          return res.json({ initiatives: finalInitiatives, sprints: [] });
        }

        // Создаём виртуальные спринты
        const sortedTasks = tasksForVirtual.sort((a, b) => {
          const dateA = new Date(a.doneDate!);
          const dateB = new Date(b.doneDate!);
          return dateA.getTime() - dateB.getTime();
        });

        const firstDate = new Date(sortedTasks[0].doneDate!);
        const lastDate = new Date(sortedTasks[sortedTasks.length - 1].doneDate!);

        const virtualSprints: any[] = [];
        const virtualSprintTasksMap = new Map<number, any[]>();
        let currentStartDate = new Date(firstDate);
        let sprintNumber = 1;

        while (currentStartDate <= lastDate) {
          const currentEndDate = new Date(currentStartDate);
          currentEndDate.setDate(currentEndDate.getDate() + sprintDuration - 1);

          const sprintTasks = sortedTasks.filter(task => {
            const taskDate = new Date(task.doneDate!);
            return taskDate >= currentStartDate && taskDate <= currentEndDate;
          });

          if (sprintTasks.length > 0) {
            const totalSp = sprintTasks.reduce((sum, task) => sum + task.size, 0);
            const virtualSprintId = -(sprintNumber);

            virtualSprints.push({
              sprintId: virtualSprintId,
              boardId: initBoardId,
              title: `Период ${sprintNumber}`,
              velocity: totalSp,
              startDate: currentStartDate.toISOString(),
              finishDate: currentEndDate.toISOString(),
              actualFinishDate: currentEndDate.toISOString(),
              goal: `Задачи завершенные с ${currentStartDate.toLocaleDateString('ru-RU')} по ${currentEndDate.toLocaleDateString('ru-RU')}`,
              isVirtual: true
            });

            virtualSprintTasksMap.set(virtualSprintId, sprintTasks);
          }

          currentStartDate = new Date(currentEndDate);
          currentStartDate.setDate(currentStartDate.getDate() + 1);
          sprintNumber++;
        }


        // Группируем задачи по инициативам и виртуальным спринтам
        const initiativesWithSprints = initiatives.map(initiative => {
          const sprintsMap = new Map<number, { sp: number; tasks: any[] }>();
          
          virtualSprintTasksMap.forEach((tasks, virtualSprintId) => {
            const tasksForInit = tasks.filter(task => task.initCardId === initiative.cardId);
            if (tasksForInit.length > 0) {
              // Считаем SP только для done-задач (как в cost-structure)
              const sp = tasksForInit
                .filter(task => task.state === '3-done' && task.condition !== '3 - deleted')
                .reduce((sum, task) => sum + task.size, 0);
              sprintsMap.set(virtualSprintId, {
                sp,
                tasks: tasksForInit.map(task => ({
                  id: task.id,
                  cardId: task.cardId,
                  title: task.title,
                  type: task.type,
                  size: task.size,
                  state: task.state,
                  condition: task.condition,
                  archived: task.archived,
                  doneDate: task.doneDate
                }))
              });
            }
          });

          const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
            sprint_id,
            sp: data.sp,
            tasks: data.tasks
          }));

          return {
            ...initiative,
            sprints,
            involvement: null
          };
        });

        // Фильтруем инициативы (с задачами, поддержка бизнеса, или в очереди)
        const filteredInitiatives = initiativesWithSprints.filter(init => {
          const hasSprints = init.sprints.length > 0;
          const isSupport = init.cardId === 0;
          const isQueued = init.state === "1-queued";
          return hasSprints || isSupport || isQueued;
        });

        // Рассчитываем involvement для виртуальных спринтов
        const sprintPeriods = new Map(
          virtualSprints.map(s => [s.sprintId, { 
            startDate: new Date(s.startDate),
            finishDate: new Date(s.finishDate)
          }])
        );
        
        const initiativesWithInvolvement = calculateInitiativesInvolvement(filteredInitiatives, sprintPeriods);
        
        // Применяем фильтрацию по году и активности
        const finalInitiatives = filterInitiativesForTimeline(initiativesWithInvolvement, year, showActiveOnly);

        // Рассчитываем разбивку SP по командам для каждой инициативы
        const allTeams = await storage.getAllTeams();
        const spPriceMap = await buildSpPriceMap(allTeams);
        const teamInfoMap = new Map(allTeams.map(t => [t.teamId, { name: t.teamName, spPrice: t.spPrice || 0 }]));
        const crossTeamTasks = allTasks.filter(task =>
          task.initCardId !== null &&
          allInitiativeCardIds.has(task.initCardId) &&
          task.state === '3-done' &&
          task.condition !== '3 - deleted'
        );
        const teamBreakdownByInit = new Map<number, Record<string, number>>();
        const totalDoneSPByInit = new Map<number, number>();
        crossTeamTasks.forEach(task => {
          const initId = task.initCardId!;
          if (!teamBreakdownByInit.has(initId)) {
            teamBreakdownByInit.set(initId, {});
          }
          const breakdown = teamBreakdownByInit.get(initId)!;
          const info = task.teamId ? teamInfoMap.get(task.teamId) : null;
          const tName = info?.name || 'Без команды';
          const spPrice = getSpPriceForTask(spPriceMap, task.teamId, task, info?.spPrice || 0);
          const cost = task.size * spPrice;
          breakdown[tName] = (breakdown[tName] || 0) + cost;
          totalDoneSPByInit.set(initId, (totalDoneSPByInit.get(initId) || 0) + task.size);
        });
        const finalWithBreakdown = finalInitiatives.map((init: any) => ({
          ...init,
          teamBreakdown: teamBreakdownByInit.get(init.cardId) || {},
          totalDoneSP: totalDoneSPByInit.get(init.cardId) || 0
        }));

        res.json({ initiatives: finalWithBreakdown, sprints: virtualSprints });
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve timeline data" 
      });
    }
  });

  app.get("/api/initiatives/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const initiative = await storage.getInitiative(id);
      if (!initiative) {
        return res.status(404).json({ 
          success: false, 
          error: "Initiative not found" 
        });
      }
      res.json(initiative);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve initiative" 
      });
    }
  });

  app.post("/api/initiatives", async (req, res) => {
    try {
      const validatedData = insertInitiativeSchema.parse(req.body);
      const initiative = await storage.createInitiative(validatedData);
      res.status(201).json(initiative);
    } catch (error) {
      
      // Check if it's a validation error
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      // Server error
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.patch("/api/initiatives/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate that body is not empty
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "Request body cannot be empty" 
        });
      }
      
      const validatedData = insertInitiativeSchema.partial().parse(req.body);
      
      // Validate that at least one field is provided after parsing
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one field must be provided for update" 
        });
      }
      
      const initiative = await storage.updateInitiative(id, validatedData);
      
      if (!initiative) {
        return res.status(404).json({ 
          success: false, 
          error: "Initiative not found" 
        });
      }
      
      res.json(initiative);
    } catch (error) {
      
      // Check if it's a validation error
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      // Server error
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.delete("/api/initiatives/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteInitiative(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to delete initiative" 
      });
    }
  });

  // Sprints endpoints
  app.get("/api/sprints", async (req, res) => {
    try {
      const sprints = await storage.getAllSprints();
      res.json(sprints);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprints" 
      });
    }
  });

  app.get("/api/sprints/board/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }
      const sprints = await storage.getSprintsByBoardId(boardId);
      res.json(sprints);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprints" 
      });
    }
  });

  app.get("/api/sprints/:sprintId", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }
      const sprint = await storage.getSprint(sprintId);
      if (!sprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found" 
        });
      }
      res.json(sprint);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprint" 
      });
    }
  });

  app.get("/api/sprints/:sprintId/preview", async (req, res) => {
    res.setTimeout(300000);
    try {
      const sprintId = parseInt(req.params.sprintId);
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 10;

      if (isNaN(sprintId)) {
        return res.status(400).json({ success: false, error: "Invalid sprint ID" });
      }

      const kaitenSprint = await kaitenClient.getSprint(sprintId);
      if (!kaitenSprint) {
        return res.status(404).json({ success: false, error: "Sprint not found in Kaiten" });
      }

      const sprint = {
        sprintId: kaitenSprint.id,
        boardId: kaitenSprint.board_id,
        title: kaitenSprint.title,
        velocity: kaitenSprint.velocity || 0,
        startDate: kaitenSprint.start_date,
        finishDate: kaitenSprint.finish_date,
        actualFinishDate: kaitenSprint.actual_finish_date || null,
        goal: kaitenSprint.goal || null,
      };

      const allCards = kaitenSprint.cards && Array.isArray(kaitenSprint.cards) ? kaitenSprint.cards : [];
      const totalCards = allCards.length;
      const batch = allCards.slice(offset, offset + limit);

      const sprintEndDate = kaitenSprint.actual_finish_date || kaitenSprint.finish_date;
      const sprintStartDate = kaitenSprint.start_date;
      const sprintEndTime = new Date(sprintEndDate).getTime();
      const sprintStartTime = new Date(sprintStartDate).getTime();

      const tasks: any[] = [];
      const tasksOutside: any[] = [];

      for (const sprintCard of batch) {
        try {
          const card = await kaitenClient.getCard(sprintCard.id);
          if (card.condition === 3) continue;

          let initCardId = 0;
          let initiativeTitle = null;
          if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
            try {
              initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
              if (initCardId > 0) {
                const initiative = await storage.getInitiative(initCardId.toString());
                if (!initiative) {
                  const initiativeCard = await kaitenClient.getCard(initCardId);
                  initiativeTitle = initiativeCard.title;
                } else {
                  initiativeTitle = initiative.title;
                }
              }
            } catch (parentError) {
              console.error(`[Sprint Preview] Error finding initiative for card ${sprintCard.id}:`, parentError);
            }
          }

          const taskData = {
            id: card.id.toString(),
            cardId: card.id,
            title: card.title,
            size: card.size || 0,
            state: card.state === 3 ? "3-done" : (card.state === 2 ? "2-inProgress" : "1-queued"),
            initiativeCardId: initCardId,
            initiativeTitle: initiativeTitle,
            doneDate: card.last_moved_to_done_at || null,
            condition: card.condition,
          };

          if (taskData.doneDate) {
            const taskTime = new Date(taskData.doneDate).getTime();
            if (taskTime < sprintStartTime || taskTime > sprintEndTime) {
              tasksOutside.push(taskData);
              continue;
            }
          }
          tasks.push(taskData);
        } catch (cardError) {
          console.error(`[Sprint Preview] Error processing card ${sprintCard.id}:`, cardError);
        }
      }

      const hasMore = offset + limit < totalCards;

      res.json({
        sprint,
        tasks,
        tasksOutside,
        totalCards,
        offset,
        limit,
        hasMore,
        stats: {
          totalSP: 0,
          doneSP: 0,
          deliveryPlanCompliance: 0,
        },
      });
    } catch (error) {
      console.error(`[Sprint Preview] Error retrieving sprint:`, error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve sprint preview from Kaiten",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/sprints/:sprintId/info", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      const sprint = await storage.getSprint(sprintId);
      if (!sprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found" 
        });
      }

      const allSprintTasks = await storage.getTasksBySprint(sprintId);
      
      // Разделяем задачи на две группы
      const sprintEndDate = sprint.actualFinishDate || sprint.finishDate;
      const sprintStartDate = sprint.startDate;
      const sprintEndTime = sprintEndDate ? new Date(sprintEndDate).getTime() : Date.now();
      const sprintStartTime = sprintStartDate ? new Date(sprintStartDate).getTime() : 0;
      
      const tasksInside: any[] = [];
      const tasksOutside: any[] = [];
      
      for (const task of allSprintTasks) {
        const taskInfo = {
          id: task.id,
          cardId: task.cardId,
          title: task.title,
          size: task.size,
          state: task.state,
          condition: task.condition,
          initiativeCardId: task.initCardId,
          doneDate: task.doneDate,
        };
        
        if (!task.doneDate) {
          tasksInside.push(taskInfo);
        } else {
          const taskDoneTime = new Date(task.doneDate).getTime();
          if (taskDoneTime >= sprintStartTime && taskDoneTime <= sprintEndTime) {
            tasksInside.push(taskInfo);
          } else {
            tasksOutside.push(taskInfo);
          }
        }
      }
      
      // СПД = Done SP (в даты спринта) / Total SP (всех планируемых)
      let totalSP = 0;
      let doneSP = 0;
      
      // Всего SP = ВСЕ задачи
      allSprintTasks.forEach(task => {
        totalSP += task.size || 0;
      });
      
      // Done SP = только done задачи с doneDate внутри дат спринта
      tasksInside.forEach(task => {
        if (task.state === '3-done' && task.condition !== '3 - deleted') {
          doneSP += task.size || 0;
        }
      });
      
      // СПД = Done SP / Total SP
      const deliveryPlanCompliance = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;
      
      res.json({
        sprint,
        tasks: tasksInside,
        tasksOutside: tasksOutside,
        stats: {
          totalSP,
          doneSP,
          deliveryPlanCompliance,
        },
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprint info" 
      });
    }
  });

  app.get("/api/sprints/:sprintId/stats", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      // Получаем спринт из БД
      const sprint = await storage.getSprint(sprintId);
      if (!sprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found in database" 
        });
      }

      // Получаем все задачи спринта из БД
      const tasks = await storage.getTasksBySprint(sprintId);
      
      
      // Подсчитываем статистику
      let totalSP = 0;
      let doneSP = 0;
      
      tasks.forEach(task => {
        const taskSize = task.size || 0;
        totalSP += taskSize;
        const isDone = task.state === '3-done' && task.condition !== '3 - deleted';
        if (isDone) {
          doneSP += taskSize;
        }
      });
      
      const deliveryPlanCompliance = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;
      
      
      res.json({
        success: true,
        stats: {
          totalSP,
          doneSP,
          deliveryPlanCompliance,
        },
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprint stats" 
      });
    }
  });

  app.get("/api/sprints/check-sync/:teamId", async (req, res) => {
    res.setTimeout(300000);
    try {
      const teamId = req.params.teamId;
      
      const team = await storage.getTeamById(teamId);
      if (!team) {
        return res.status(404).json({
          success: false,
          error: "Team not found"
        });
      }
      
      if (!team.sprintBoardId || !team.spaceId) {
        return res.json({
          success: true,
          synced: false,
          reason: "No sprint board or space configured"
        });
      }
      
      const latestSprint = await storage.getLatestSprintByBoardId(team.sprintBoardId);
      
      // Хелпер для синхронизации задач спринта
      const syncSprintTasks = async (sprintId: number, kaitenSprint: any): Promise<number> => {
        let tasksSynced = 0;
        if (kaitenSprint.cards && Array.isArray(kaitenSprint.cards) && kaitenSprint.cards.length > 0) {
          for (const sprintCard of kaitenSprint.cards) {
            try {
              const card = await kaitenClient.getCard(sprintCard.id);
              
              if (card.condition === 3) {
                continue;
              }
              
              let initCardId: number | null = null;
              if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
                initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
              } else {
                initCardId = 0;
              }
              
              let state: "1-queued" | "2-inProgress" | "3-done";
              if (card.state === 3) {
                state = "3-done";
              } else if (card.state === 2) {
                state = "2-inProgress";
              } else {
                state = "1-queued";
              }
              
              const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
              
              await storage.syncTaskFromKaiten(
                card.id,
                card.board_id,
                card.title,
                card.created || new Date().toISOString(),
                state,
                card.size || 0,
                condition,
                card.archived || false,
                initCardId,
                card.type?.name,
                card.completed_at ?? undefined,
                sprintId,
                card.last_moved_to_done_at ?? null,
                team.teamId
              );
              
              tasksSynced++;
            } catch (taskError) {
              console.error(`[CHECK-SYNC] Error syncing task ${sprintCard.id}:`, taskError instanceof Error ? taskError.message : String(taskError));
            }
          }
        }
        return tasksSynced;
      };
      
      // Хелпер для сохранения нового спринта
      const saveNewSprint = async (kaitenSprint: any): Promise<{ sprintId: number; tasksSynced: number } | null> => {
        if (!kaitenSprint || !kaitenSprint.board_id || !kaitenSprint.start_date || !kaitenSprint.finish_date) {
          console.log(`[CHECK-SYNC] Sprint missing required fields`);
          return null;
        }
        
        await storage.syncSprintFromKaiten(
          kaitenSprint.id,
          kaitenSprint.board_id,
          kaitenSprint.title,
          kaitenSprint.velocity || 0,
          kaitenSprint.start_date,
          kaitenSprint.finish_date,
          kaitenSprint.actual_finish_date || null,
          kaitenSprint.goal || null
        );
        
        const tasksSynced = await syncSprintTasks(kaitenSprint.id, kaitenSprint);
        return { sprintId: kaitenSprint.id, tasksSynced };
      };
      
      try {
        let previousSprintUpdated = false;
        let previousSprintTasksSynced = 0;
        
        if (latestSprint && !latestSprint.actualFinishDate) {
          const refreshedSprint = await kaitenClient.getSprint(latestSprint.sprintId);
          
          if (refreshedSprint) {
            await storage.syncSprintFromKaiten(
              refreshedSprint.id,
              refreshedSprint.board_id,
              refreshedSprint.title,
              refreshedSprint.velocity || 0,
              refreshedSprint.start_date,
              refreshedSprint.finish_date,
              refreshedSprint.actual_finish_date || null,
              refreshedSprint.goal || null
            );
            
            previousSprintTasksSynced = await syncSprintTasks(refreshedSprint.id, refreshedSprint);
            previousSprintUpdated = true;
            
            if (!refreshedSprint.actual_finish_date) {
              return res.json({
                success: true,
                synced: true,
                previousSprintUpdated: true,
                sprintStillActive: true,
                sprintId: refreshedSprint.id,
                tasksSynced: previousSprintTasksSynced
              });
            }
            
          }
        }
        
        const cards = await kaitenClient.getBoardCardsFromSpace(team.spaceId, team.sprintBoardId);
        
        if (!cards || cards.length === 0) {
          return res.json({
            success: true,
            synced: previousSprintUpdated,
            previousSprintUpdated,
            tasksSynced: previousSprintTasksSynced,
            reason: "No cards on sprint board"
          });
        }
        
        const cardWithSprint = cards.find((c: any) => c.sprint_id);
        const sprintId = cardWithSprint?.sprint_id;
        
        if (!sprintId) {
          return res.json({
            success: true,
            synced: previousSprintUpdated,
            previousSprintUpdated,
            tasksSynced: previousSprintTasksSynced,
            reason: "No cards have sprint assigned"
          });
        }
        
        const existingSprint = await storage.getSprint(sprintId);
        if (existingSprint) {
          return res.json({
            success: true,
            synced: previousSprintUpdated,
            previousSprintUpdated,
            sprintExists: true,
            sprintId,
            tasksSynced: previousSprintTasksSynced
          });
        }
        
        const kaitenSprint = await kaitenClient.getSprint(sprintId);
        
        const result = await saveNewSprint(kaitenSprint);
        
        if (result) {
          return res.json({
            success: true,
            synced: true,
            newSprintSynced: true,
            previousSprintUpdated,
            sprintId: result.sprintId,
            tasksSynced: result.tasksSynced
          });
        }
        
        return res.json({
          success: true,
          synced: previousSprintUpdated,
          previousSprintUpdated,
          tasksSynced: previousSprintTasksSynced,
          reason: "Failed to save new sprint"
        });
        
      } catch (kaitenError) {
        console.error(`[CHECK-SYNC] Kaiten API error:`, kaitenError instanceof Error ? kaitenError.message : kaitenError);
        return res.json({
          success: true,
          synced: false,
          reason: "Kaiten API error",
          fromDb: true
        });
      }
      
    } catch (error) {
      console.error(`[CHECK-SYNC] Error:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to check sprint sync"
      });
    }
  });

  app.post("/api/sprints/:sprintId/save", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      const kaitenSprint = await kaitenClient.getSprint(sprintId);
      
      if (!kaitenSprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found in Kaiten" 
        });
      }

      
      // Валидируем обязательные поля
      if (!kaitenSprint.board_id || !kaitenSprint.start_date || !kaitenSprint.finish_date) {
        return res.status(400).json({
          success: false,
          error: "Sprint is missing required fields (board_id, start_date, or finish_date)"
        });
      }

      // Проверяем наличие команды ДО сохранения спринта
      const team = await storage.getTeamBySprintBoardId(kaitenSprint.board_id);
      if (!team) {
        return res.status(400).json({
          success: false,
          error: `Team with sprint board ID ${kaitenSprint.board_id} not found. Please create a team with this sprint board ID first.`
        });
      }

      const teamId = team.teamId;

      // Сохраняем спринт
      await storage.syncSprintFromKaiten(
        kaitenSprint.id,
        kaitenSprint.board_id,
        kaitenSprint.title,
        kaitenSprint.velocity || 0,
        kaitenSprint.start_date,
        kaitenSprint.finish_date,
        kaitenSprint.actual_finish_date || null,
        kaitenSprint.goal || null
      );

      // Удаляем все старые задачи этого спринта перед синхронизацией новых
      await storage.deleteTasksForSprint(sprintId);

      let tasksSaved = 0;
      const errors: string[] = [];
      
      if (kaitenSprint.cards && Array.isArray(kaitenSprint.cards)) {
        
        // Параллельно получаем все карточки
        const cardPromises = kaitenSprint.cards.map(sprintCard => 
          kaitenClient.getCard(sprintCard.id).catch(err => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            errors.push(`Card ${sprintCard.id}: ${errorMessage}`);
            return null;
          })
        );
        
        const cards = await Promise.all(cardPromises);
        
        // Сохраняем все задачи (независимо от статуса)
        const validCards = cards.filter(c => c !== null);
        
        // Сохраняем все карточки
        for (const card of validCards) {
          try {
            // Пропускаем удаленные карточки (condition === 3)
            if (card.condition === 3) {
              continue;
            }
            
            // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
            let initCardId = 0;
            if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
              const parentCardId = card.parents_ids[0];
              initCardId = await findInitiativeInParentChain(parentCardId);
              
              if (initCardId !== 0) {
              } else {
              }
            } else {
            }

            // Преобразуем state и condition из number в строку с валидацией
            let stateStr: "1-queued" | "2-inProgress" | "3-done" = "1-queued";
            if (card.state === 1) stateStr = "1-queued";
            else if (card.state === 2) stateStr = "2-inProgress";
            else if (card.state === 3) stateStr = "3-done";
            else {
            }

            let conditionStr: "1-live" | "2-archived" = "1-live";
            if (card.condition === 1) conditionStr = "1-live";
            else if (card.condition === 2) conditionStr = "2-archived";
            else {
            }

            // Сохраняем задачу
            await storage.syncTaskFromKaiten(
              card.id,
              card.board_id,
              card.title,
              card.created || new Date().toISOString(),
              stateStr,
              card.size || 0,
              conditionStr,
              card.archived || false,
              initCardId,
              card.type?.name,
              card.completed_at || undefined,
              sprintId,
              card.last_moved_to_done_at || null,  // Используем last_moved_to_done_at для doneDate
              teamId
            );

            tasksSaved++;
          } catch (cardError) {
            const errorMessage = cardError instanceof Error ? cardError.message : String(cardError);
            errors.push(`Card ${card.id}: ${errorMessage}`);
          }
        }
      }

      if (errors.length > 0) {
      }
      
      res.json({
        success: true,
        sprint: {
          sprintId: kaitenSprint.id,
          title: kaitenSprint.title,
        },
        tasksSaved,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to save sprint to database" 
      });
    }
  });

  // Tasks endpoints
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve tasks" 
      });
    }
  });

  app.get("/api/tasks/board/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }
      const tasks = await storage.getTasksByBoardId(boardId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve tasks" 
      });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ 
          success: false, 
          error: "Task not found" 
        });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve task" 
        });
    }
  });

  app.get("/api/tasks/grouped/:initBoardId/:sprintDuration", async (req, res) => {
    try {
      const initBoardId = parseInt(req.params.initBoardId);
      const sprintDuration = parseInt(req.params.sprintDuration);
      
      if (isNaN(initBoardId) || isNaN(sprintDuration)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID or sprint duration" 
        });
      }


      // Получаем все задачи без sprintId для этой доски
      const allTasks = await storage.getAllTasks();
      const initiativeTasks = allTasks.filter(task => 
        task.sprintId === null && 
        task.doneDate !== null && 
        task.doneDate !== ''
      );


      if (initiativeTasks.length === 0) {
        return res.json([]);
      }

      // Сортируем по дате закрытия
      const sortedTasks = initiativeTasks.sort((a, b) => {
        const dateA = new Date(a.doneDate!);
        const dateB = new Date(b.doneDate!);
        return dateA.getTime() - dateB.getTime();
      });

      // Определяем первую и последнюю дату
      const firstDate = new Date(sortedTasks[0].doneDate!);
      const lastDate = new Date(sortedTasks[sortedTasks.length - 1].doneDate!);

      // Создаем интервалы (виртуальные спринты)
      const virtualSprints: any[] = [];
      let currentStartDate = new Date(firstDate);
      let sprintNumber = 1;

      while (currentStartDate <= lastDate) {
        const currentEndDate = new Date(currentStartDate);
        currentEndDate.setDate(currentEndDate.getDate() + sprintDuration - 1);

        // Получаем задачи для этого интервала
        const sprintTasks = sortedTasks.filter(task => {
          const taskDate = new Date(task.doneDate!);
          return taskDate >= currentStartDate && taskDate <= currentEndDate;
        });

        if (sprintTasks.length > 0) {
          const totalSp = sprintTasks.reduce((sum, task) => sum + task.size, 0);

          virtualSprints.push({
            sprintId: -(sprintNumber), // Отрицательный ID для виртуальных спринтов
            boardId: initBoardId,
            title: `Период ${sprintNumber}`,
            velocity: totalSp,
            startDate: currentStartDate.toISOString(),
            finishDate: currentEndDate.toISOString(),
            actualFinishDate: currentEndDate.toISOString(),
            goal: `Задачи завершенные с ${currentStartDate.toLocaleDateString('ru-RU')} по ${currentEndDate.toLocaleDateString('ru-RU')}`,
            isVirtual: true
          });
        }

        // Переходим к следующему интервалу
        currentStartDate = new Date(currentEndDate);
        currentStartDate.setDate(currentStartDate.getDate() + 1);
        sprintNumber++;
      }


      res.json(virtualSprints);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve grouped tasks" 
      });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validatedData);
      res.status(201).json(task);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "Request body cannot be empty" 
        });
      }
      
      const validatedData = insertTaskSchema.partial().parse(req.body);
      
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one field must be provided for update" 
        });
      }
      
      const task = await storage.updateTask(id, validatedData);
      
      if (!task) {
        return res.status(404).json({ 
          success: false, 
          error: "Task not found" 
        });
      }
      
      res.json(task);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTask(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to delete task" 
      });
    }
  });

  app.post("/api/kaiten/sync-spaces", async (req, res) => {
    res.setTimeout(300000);
    try {
      const { spaceIds } = req.body;
      console.log("[Sync Spaces] Request body:", JSON.stringify(req.body));
      console.log("[Sync Spaces] spaceIds:", spaceIds);
      if (!Array.isArray(spaceIds) || spaceIds.length === 0) {
        return res.status(400).json({ success: false, error: "spaceIds array is required" });
      }

      const allTeams = await storage.getAllTeams();
      console.log("[Sync Spaces] Total teams in DB:", allTeams.length);
      console.log("[Sync Spaces] Teams initSpaceId values:", allTeams.map(t => ({ teamId: t.teamId, teamName: t.teamName, initSpaceId: t.initSpaceId, initBoardId: t.initBoardId })));

      const relevantTeams = allTeams.filter(t => spaceIds.includes(Number(t.initSpaceId || t.initBoardId)));
      console.log("[Sync Spaces] Relevant teams found:", relevantTeams.length, relevantTeams.map(t => t.teamName));

      const boardIds = [...new Set(relevantTeams.map(t => t.initBoardId))];
      console.log("[Sync Spaces] Board IDs to sync:", boardIds);

      const plannedValueId = "id_237";
      const factValueId = "id_238";
      const spPriceMapSync = await buildSpPriceMap(allTeams);
      const currentYearSync = new Date().getFullYear();

      const updatedSpaces: { spaceId: number; spaceName: string }[] = [];

      for (const numericSpaceId of spaceIds.map(Number)) {
        try {
          console.log("[Sync Spaces] Fetching space info for spaceId:", numericSpaceId);
          const spaceInfo = await kaitenClient.getSpaceInfo(numericSpaceId);
          console.log("[Sync Spaces] Space info result:", spaceInfo);
          if (spaceInfo) {
            updatedSpaces.push({ spaceId: numericSpaceId, spaceName: spaceInfo.title });
            const teamsForSpace = allTeams.filter(t => Number(t.initSpaceId) === numericSpaceId || (!t.initSpaceId && Number(t.initBoardId) === numericSpaceId));
            console.log("[Sync Spaces] Teams for space:", teamsForSpace.length, teamsForSpace.map(t => t.teamName));
            for (const team of teamsForSpace) {
              console.log("[Sync Spaces] Updating team spaceName:", team.teamName, "old:", team.initSpaceName, "new:", spaceInfo.title);
              if (team.initSpaceName !== spaceInfo.title) {
                await storage.updateTeam(team.teamId, { initSpaceName: spaceInfo.title });
              }
            }
          } else {
            console.log("[Sync Spaces] WARNING: Could not get space info for spaceId:", numericSpaceId);
          }
        } catch (spaceError: any) {
          console.error(`[Sync Spaces] Error fetching space info for ${numericSpaceId}:`, spaceError.message || spaceError);
          // Продолжаем к следующему пространству
          continue;
        }
      }

      const allSyncedInitiatives: any[] = [];

      for (const boardId of boardIds) {
        try {
          console.log("[Sync Spaces] Syncing board:", boardId);
          const allCards = await kaitenClient.getCardsFromBoard(boardId);
          const nonArchivedCards = allCards.filter(c => !c.archived);
          console.log(`[Sync Spaces] Board ${boardId}: ${allCards.length} total cards, ${nonArchivedCards.length} non-archived`);
          const syncedCardIds: number[] = [];

          for (const card of nonArchivedCards) {
            try {
              const fullCard = await kaitenClient.getCard(card.id);
              if (!fullCard) {
                console.log(`[Sync Spaces] Card ${card.id} returned null from Kaiten API`);
                continue;
              }

              if (fullCard.archived) {
                console.log(`[Sync Spaces] Skipping archived initiative card ${fullCard.id} "${fullCard.title}"`);
                continue;
              }

              console.log(`[Sync Spaces] Initiative card ${fullCard.id} "${fullCard.title}" — archived: ${fullCard.archived}, condition: ${fullCard.condition}, state: ${fullCard.state}`);

              let state: "1-queued" | "2-inProgress" | "3-done";
              if (fullCard.state === 3) {
                state = "3-done";
              } else if (fullCard.state === 2) {
                state = "2-inProgress";
              } else {
                state = "1-queued";
              }
              const condition: "1-live" | "2-archived" = fullCard.archived ? "2-archived" : "1-live";

              const rawPlanned = fullCard.properties?.[plannedValueId];
              const plannedValue = rawPlanned == null ? undefined : String(rawPlanned);
              const rawFact = fullCard.properties?.[factValueId];
              const factValue = rawFact == null ? undefined : String(rawFact);

              const synced = await storage.syncInitiativeFromKaiten(
                fullCard.id,
                boardId,
                fullCard.title,
                state,
                condition,
                fullCard.size || 0,
                fullCard.type?.name,
                plannedValueId,
                plannedValue,
                factValueId,
                factValue,
                fullCard.due_date || null,
                fullCard.last_moved_to_done_at || null,
                fullCard.archived || false
              );
              allSyncedInitiatives.push(synced);
              syncedCardIds.push(card.id);
            } catch (cardError: any) {
              console.error(`[Sync Spaces] Skipping card ${card.id} due to error:`, cardError.message || cardError);
              continue;
            }
          }

          await storage.archiveInitiativesNotInList(boardId, syncedCardIds);
        } catch (boardError: any) {
          console.error(`[Sync Spaces] Error syncing board ${boardId}:`, boardError.message || boardError);
          continue;
        }
      }

      console.log(`[Sync Spaces] Total initiatives synced across all boards: ${allSyncedInitiatives.length}`);

      res.json({
        success: true,
        syncedInitiatives: allSyncedInitiatives.length,
        updatedSpaces
      });
    } catch (error) {
      console.error("[Sync Spaces] Error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync spaces"
      });
    }
  });

  app.post("/api/kaiten/sync-board/:boardId", async (req, res) => {
    res.setTimeout(300000);
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }

      
      const allCards = await kaitenClient.getCardsFromBoard(boardId);
      
      // Фильтруем: сохраняем только неархивные инициативы
      const cards = allCards.filter(card => !card.archived);
      

      const syncedInitiatives = [];
      const syncedCardIds: number[] = [];
      const plannedValueId = "id_237";
      const factValueId = "id_238";
      
      for (const card of cards) {
        let state: "1-queued" | "2-inProgress" | "3-done";
        
        // Basic Kaiten state mapping (can be extended for more states)
        // state 1 = queued, state 2 = in progress, state 3 = done
        // TODO: Add configurable mapping for custom Kaiten workflow states
        if (card.state === 3) {
          state = "3-done";
        } else if (card.state === 2) {
          state = "2-inProgress";
        } else {
          state = "1-queued";
        }
        
        const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";

        
        // Логируем всю структуру properties для диагностики
        
        // Получаем plannedValue из properties по ключу plannedValueId
        const rawPlanned = card.properties?.[plannedValueId];
        const plannedValue = rawPlanned == null ? undefined : String(rawPlanned);
        
        // log(`[Kaiten Sync] Card ${card.id} - raw plannedValue from properties[${plannedValueId}]:`, rawPlanned);
        // log(`[Kaiten Sync] Card ${card.id} - plannedValue (converted to string):`, plannedValue);
        
        // Получаем factValue из properties по ключу factValueId
        const rawFact = card.properties?.[factValueId];
        const factValue = rawFact == null ? undefined : String(rawFact);
        
        // log(`[Kaiten Sync] Card ${card.id} - raw factValue from properties[${factValueId}]:`, rawFact);
        // log(`[Kaiten Sync] Card ${card.id} - factValue (converted to string):`, factValue);
        
        // Логируем даты для отладки

        const synced = await storage.syncInitiativeFromKaiten(
          card.id,
          boardId,
          card.title,
          state,
          condition,
          card.size || 0,
          card.type?.name,
          plannedValueId,
          plannedValue,
          factValueId,
          factValue,
          card.due_date || null,
          card.last_moved_to_done_at || null
        );
        
        syncedInitiatives.push(synced);
        syncedCardIds.push(card.id);
      }

      // Архивируем инициативы, которых больше нет на доске
      await storage.archiveInitiativesNotInList(boardId, syncedCardIds);

      
      // Для инициатив типа Compliance и Enabler автоматически проставляем planned_value = planned_cost и fact_value = fact_cost
      const allTeams = await storage.getAllTeams();
      const spPriceMapBoard = await buildSpPriceMap(allTeams);
      const relevantTeams = allTeams.filter(team => team.initBoardId === boardId);
      
      if (relevantTeams.length > 0) {
        const team = relevantTeams[0];
        const currentYear = new Date().getFullYear();
        const spPrice = getSpPriceForYear(spPriceMapBoard, team.teamId, currentYear, team.spPrice || 0);
        
        for (const initiative of syncedInitiatives) {
          if (initiative.type === 'Compliance' || initiative.type === 'Enabler') {
            const plannedCost = initiative.size * spPrice;
            
            const tasks = await storage.getTasksByInitCardId(initiative.cardId);
            let factCost = 0;
            for (const task of tasks) {
              const taskSpPrice = getSpPriceForTask(spPriceMapBoard, task.teamId, task, spPrice);
              factCost += task.size * taskSpPrice;
            }
            
            await storage.updateInitiative(initiative.id, {
              plannedValue: String(plannedCost),
              factValue: String(factCost)
            });
          }
        }
      }
      
      res.json({
        success: true,
        count: syncedInitiatives.length,
        initiatives: syncedInitiatives
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync initiatives from Kaiten" 
      });
    }
  });

  app.post("/api/kaiten/sync-tasks/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }

      
      // Lookup team by initBoardId
      const team = await storage.getTeamByInitBoardId(boardId);
      if (!team) {
        return res.status(404).json({
          success: false,
          error: `No team found with initBoardId=${boardId}`
        });
      }
      
      // Step 1: Get list of cards from board
      const boardCards = await kaitenClient.getCardsFromBoard(boardId);

      const syncedTasks = [];
      
      // Step 2: Fetch each card individually to get parents_ids
      for (const boardCard of boardCards) {
        const card = await kaitenClient.getCard(boardCard.id);
        
        // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
        let initCardId = 0; // По умолчанию - "Поддержка бизнеса"
        if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
          initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
        }
        
        // Синхронизируем таски с state === 3 (done)
        if (card.state === 3) {
          
          let state: "1-queued" | "2-inProgress" | "3-done";
          
          if (card.state === 3) {
            state = "3-done";
          } else if (card.state === 2) {
            state = "2-inProgress";
          } else {
            state = "1-queued";
          }
          
          const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";


          const synced = await storage.syncTaskFromKaiten(
            card.id,
            boardId,
            card.title,
            card.created || new Date().toISOString(),
            state,
            card.size || 0,
            condition,
            card.archived || false, // archived status from Kaiten
            initCardId, // parent card_id from parents_ids
            card.type?.name,
            card.completed_at ?? undefined,
            card.sprint_id ?? null, // sprint_id from Kaiten
            card.last_moved_to_done_at ?? null,
            team.teamId
          );
          
          syncedTasks.push(synced);
        }
      }

      
      res.json({
        success: true,
        count: syncedTasks.length,
        tasks: syncedTasks
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync tasks from Kaiten" 
      });
    }
  });

  app.post("/api/kaiten/update-sprint/:sprintId", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      
      // Получаем данные спринта из Kaiten
      const sprint = await kaitenClient.getSprint(sprintId);
      
      if (!sprint.cards || !Array.isArray(sprint.cards)) {
        return res.json({
          success: true,
          updated: 0,
          message: "No cards found in sprint"
        });
      }

      
      // Получаем все tasks из базы данных
      const allTasks = await storage.getAllTasks();
      
      // Создаем Set с card_id из спринта для быстрого поиска
      const sprintCardIds = new Set(sprint.cards.map(card => card.id));
      
      let updatedCount = 0;
      
      // Обновляем sprint_id для tasks, у которых card_id совпадает с card_id из спринта
      for (const task of allTasks) {
        if (sprintCardIds.has(task.cardId)) {
          
          await storage.updateTask(task.id, { sprintId });
          updatedCount++;
        }
      }

      
      res.json({
        success: true,
        updated: updatedCount,
        sprintId,
        totalCardsInSprint: sprint.cards.length,
        totalTasksInDb: allTasks.length
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to update sprint info" 
      });
    }
  });

  app.patch("/api/kaiten/update-initiative/:cardId", async (req, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      if (isNaN(cardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid card ID" 
        });
      }

      const { size, plannedValue, factValue } = req.body;
      
      
      // Подготовка обновлений для Kaiten
      const kaitenUpdates: { size?: number; properties?: Record<string, any> } = {};
      
      if (size !== undefined) {
        kaitenUpdates.size = parseInt(String(size));
      }
      
      // Обновляем properties если есть plannedValue или factValue
      if (plannedValue !== undefined || factValue !== undefined) {
        kaitenUpdates.properties = {};
        
        const plannedValueId = "id_237";
        const factValueId = "id_238";
        
        if (plannedValue !== undefined) {
          // Kaiten expects numeric values for custom properties
          kaitenUpdates.properties[plannedValueId] = plannedValue === null || plannedValue === '' ? null : parseFloat(String(plannedValue));
        }
        
        if (factValue !== undefined) {
          // Kaiten expects numeric values for custom properties
          kaitenUpdates.properties[factValueId] = factValue === null || factValue === '' ? null : parseFloat(String(factValue));
        }
      }
      
      
      // Обновляем в Kaiten
      await kaitenClient.updateCard(cardId, kaitenUpdates);
      
      // Подготовка обновлений для БД
      const dbUpdates: any = {};
      
      if (size !== undefined) {
        dbUpdates.size = parseInt(String(size));
      }
      
      if (plannedValue !== undefined) {
        dbUpdates.plannedValue = plannedValue === null || plannedValue === '' ? null : String(plannedValue);
      }
      
      if (factValue !== undefined) {
        dbUpdates.factValue = factValue === null || factValue === '' ? null : String(factValue);
      }
      
      
      // Находим инициативу в БД по cardId
      const initiative = await storage.getInitiativeByCardId(cardId);
      
      if (!initiative) {
        return res.status(404).json({ 
          success: false, 
          error: "Initiative not found in database" 
        });
      }
      
      // Обновляем в БД
      const updated = await storage.updateInitiative(initiative.id, dbUpdates);
      
      
      res.json({
        success: true,
        initiative: updated
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to update initiative" 
      });
    }
  });

  app.post("/api/kaiten/sync-sprint/:sprintId", async (req, res) => {
    res.setTimeout(300000);
    try {
      const sprintId = parseInt(req.params.sprintId);
      console.log(`[SYNC-SPRINT] Starting sync for sprint ${sprintId}`);
      
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      // Получаем данные спринта из Kaiten
      console.log(`[SYNC-SPRINT] Fetching sprint from Kaiten...`);
      const sprint = await kaitenClient.getSprint(sprintId);
      console.log(`[SYNC-SPRINT] Got sprint with ${sprint.cards?.length || 0} cards`);
      
      if (!sprint.cards || !Array.isArray(sprint.cards)) {
        return res.json({
          success: true,
          synced: 0,
          message: "No cards found in sprint"
        });
      }

      // Lookup team once before processing cards
      const dbSprint = await storage.getSprint(sprintId);
      if (!dbSprint) {
        throw new Error(`Sprint ${sprintId} not found in database`);
      }
      const team = await storage.getTeamBySprintBoardId(dbSprint.boardId);
      if (!team) {
        throw new Error(`No team found for sprint board ${dbSprint.boardId}`);
      }
      
      const syncedTasks = [];
      let errorCount = 0;
      
      // Создаем записи в tasks для каждой карточки из спринта
      for (let i = 0; i < sprint.cards.length; i++) {
        const sprintCard = sprint.cards[i];
        
        try {
          // Получаем детальную информацию по карточке чтобы получить parents_ids
          const card = await kaitenClient.getCard(sprintCard.id);
          
          // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
          let initCardId: number | null = null;
          
          if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
            const parentCardId = card.parents_ids[0];
            initCardId = await findInitiativeInParentChain(parentCardId);
          } else {
            initCardId = 0;
          }
          
          let state: "1-queued" | "2-inProgress" | "3-done";
          
          if (card.state === 3) {
            state = "3-done";
          } else if (card.state === 2) {
            state = "2-inProgress";
          } else {
            state = "1-queued";
          }
          
          const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";

          const synced = await storage.syncTaskFromKaiten(
            card.id,
            card.board_id,
            card.title,
            card.created || new Date().toISOString(),
            state,
            card.size || 0,
            condition,
            card.archived || false,
            initCardId,
            card.type?.name,
            card.completed_at ?? undefined,
            sprintId,
            card.last_moved_to_done_at ?? null,
            team.teamId
          );
          
          syncedTasks.push(synced);
          
          // Логируем прогресс каждые 10 карточек
          if ((i + 1) % 10 === 0) {
            console.log(`[SYNC-SPRINT] Processed ${i + 1}/${sprint.cards.length} cards`);
          }
        } catch (cardError) {
          errorCount++;
          console.error(`[SYNC-SPRINT] Error syncing card ${sprintCard.id}:`, cardError instanceof Error ? cardError.message : String(cardError));
          // Продолжаем синхронизацию остальных карточек
        }
      }

      console.log(`[SYNC-SPRINT] Completed: ${syncedTasks.length} synced, ${errorCount} errors`);
      
      res.json({
        success: true,
        synced: syncedTasks.length,
        errors: errorCount,
        sprintId,
        tasks: syncedTasks
      });
    } catch (error) {
      console.error(`[SYNC-SPRINT] Error:`, error instanceof Error ? error.message : String(error));
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync sprint" 
      });
    }
  });

  app.post("/api/kaiten/sync-sprints/:boardId", async (req, res) => {
    res.setTimeout(300000);
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }

      
      // Получаем все спринты с доски из Kaiten
      const kaitenSprints = await kaitenClient.getSprintsFromBoard(boardId);

      const syncedSprints = [];
      let tasksSynced = 0;
      
      for (const kaitenSprint of kaitenSprints) {
        // Получаем детальную информацию о спринте
        const sprintDetails = await kaitenClient.getSprint(kaitenSprint.id);
        
        
        // Синхронизируем спринт
        const synced = await storage.syncSprintFromKaiten(
          sprintDetails.id,
          boardId,
          sprintDetails.title || `Sprint ${sprintDetails.id}`,
          sprintDetails.velocity || 0,
          sprintDetails.start_date || new Date().toISOString(),
          sprintDetails.finish_date || new Date().toISOString(),
          sprintDetails.actual_finish_date || null,
          sprintDetails.goal || null
        );
        
        syncedSprints.push(synced);
        
        // Синхронизируем задачи спринта
        if (sprintDetails.cards && Array.isArray(sprintDetails.cards)) {
          for (const sprintCard of sprintDetails.cards) {
            try {
              const card = await kaitenClient.getCard(sprintCard.id);
              
              // Пропускаем удаленные карточки (condition === 3)
              if (card.condition === 3) {
                continue;
              }
              
              // Ищем инициативу в родительской цепочке
              let initCardId: number | null = null;
              
              if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
                initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
              } else {
                initCardId = 0;
              }
              
              let state: "1-queued" | "2-inProgress" | "3-done";
              if (card.state === 3) {
                state = "3-done";
              } else if (card.state === 2) {
                state = "2-inProgress";
              } else {
                state = "1-queued";
              }
              
              const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
              
              // Получаем team по board_id для team_id
              const team = await storage.getTeamBySprintBoardId(boardId);
              const teamId = team?.teamId || null;
              
              await storage.syncTaskFromKaiten(
                card.id,
                card.board_id,
                card.title,
                card.created || new Date().toISOString(),
                state,
                card.size || 0,
                condition,
                card.archived || false,
                initCardId,
                card.type?.name,
                card.completed_at ?? undefined,
                sprintDetails.id,
                card.last_moved_to_done_at ?? null,
                teamId
              );
              
              tasksSynced++;
            } catch (taskError) {
              console.error(`Error syncing task ${sprintCard.id}:`, taskError instanceof Error ? taskError.message : String(taskError));
            }
          }
        }
      }

      
      res.json({
        success: true,
        count: syncedSprints.length,
        sprints: syncedSprints,
        tasksSynced
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync sprints from Kaiten" 
      });
    }
  });

  app.post("/api/kaiten/sync-initiative-tasks/:initBoardId", async (req, res) => {
    try {
      const initBoardId = parseInt(req.params.initBoardId);
      if (isNaN(initBoardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid initiative board ID" 
        });
      }

      
      // Получаем начало текущего года
      const currentYear = new Date().getFullYear();
      const yearStart = new Date(currentYear, 0, 1).toISOString();
      
      
      // Получаем все задачи с фильтром по дате
      const tasks = await kaitenClient.getCardsWithDateFilter({
        boardId: initBoardId,
        lastMovedToDoneAtAfter: yearStart,
        limit: 1000
      });
      
      
      let totalTasksSynced = 0;
      const syncedTasks = [];
      
      // Сохраняем каждую задачу
      for (const taskCard of tasks) {
        try {
          // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
          let initCardId = 0;
          if (taskCard.parents_ids && Array.isArray(taskCard.parents_ids) && taskCard.parents_ids.length > 0) {
            const parentId = taskCard.parents_ids[0];
            initCardId = await findInitiativeInParentChain(parentId);
            
            if (initCardId !== 0) {
            } else {
            }
          } else {
          }
          
          let state: "1-queued" | "2-inProgress" | "3-done";
          if (taskCard.state === 3) {
            state = "3-done";
          } else if (taskCard.state === 2) {
            state = "2-inProgress";
          } else {
            state = "1-queued";
          }
          
          const condition: "1-live" | "2-archived" = taskCard.archived ? "2-archived" : "1-live";
          
          // Lookup team by initBoardId
          const team = await storage.getTeamByInitBoardId(initBoardId);
          if (!team) {
            throw new Error(`No team found for init board ${initBoardId}`);
          }

          const synced = await storage.syncTaskFromKaiten(
            taskCard.id,
            taskCard.board_id,
            taskCard.title,
            taskCard.created || new Date().toISOString(),
            state,
            taskCard.size || 0,
            condition,
            taskCard.archived || false,
            initCardId,
            taskCard.type?.name,
            taskCard.completed_at ?? undefined,
            null,
            taskCard.last_moved_to_done_at,
            team.teamId
          );
          
          syncedTasks.push(synced);
          totalTasksSynced++;
        } catch (taskError: unknown) {
          const errorMessage = taskError instanceof Error ? taskError.message : String(taskError);
        }
      }
      
      
      res.json({
        success: true,
        synced: totalTasksSynced,
        tasks: syncedTasks
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync initiative tasks" 
      });
    }
  });

  app.post("/api/kaiten/smart-sync/:teamId", async (req, res) => {
    res.setTimeout(300000);
    try {
      const teamId = req.params.teamId;
      const yearParam = req.body?.year;
      const syncYear = yearParam ? parseInt(yearParam) : null;
      
      const team = await storage.getTeamById(teamId);
      if (!team) {
        return res.status(404).json({
          success: false,
          error: `Team ${teamId} not found`
        });
      }
      
      
      // Шаг 1: Синхронизируем инициативы
      const allCards = await kaitenClient.getCardsFromBoard(team.initBoardId);
      
      // Фильтруем: сохраняем только неархивные инициативы
      const cardsToSync = allCards.filter(card => !card.archived);
      
      
      const plannedValueId = "id_237";
      const factValueId = "id_238";
      const syncedCardIds: number[] = [];
      
      let syncedCount = 0;
      for (const card of cardsToSync) {
        try {
          // Детальное логирование для отладки
          
          let state: "1-queued" | "2-inProgress" | "3-done";
          if (card.state === 3) {
            state = "3-done";
          } else if (card.state === 2) {
            state = "2-inProgress";
          } else {
            state = "1-queued";
          }
          
          
          const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
          
          const plannedValueRaw = card.properties?.[plannedValueId];
          const factValueRaw = card.properties?.[factValueId];
          
          let plannedValue: number | null = null;
          if (plannedValueRaw !== undefined && plannedValueRaw !== null && plannedValueRaw !== "") {
            const parsed = parseFloat(String(plannedValueRaw));
            if (!isNaN(parsed)) {
              plannedValue = parsed;
            }
          }
          
          let factValue: number | null = null;
          if (factValueRaw !== undefined && factValueRaw !== null && factValueRaw !== "") {
            const parsed = parseFloat(String(factValueRaw));
            if (!isNaN(parsed)) {
              factValue = parsed;
            }
          }
          
          // Логируем дату для отладки
          if (card.last_moved_to_done_at) {
          }
          
          await storage.syncInitiativeFromKaiten(
            card.id,
            team.initBoardId,
            card.title,
            state,
            condition,
            card.size || 0,
            card.type?.name || null,
            plannedValueId,
            plannedValue !== null ? String(plannedValue) : null,
            factValueId,
            factValue !== null ? String(factValue) : null,
            card.due_date || null,
            card.last_moved_to_done_at || null
          );
          
          syncedCardIds.push(card.id);
          syncedCount++;
        } catch (error) {
        }
      }
      
      await storage.archiveInitiativesNotInList(team.initBoardId, syncedCardIds);
      
      // Шаг 2: Синхронизируем все спринты из таблицы спринтов
      let tasksSynced = 0;
      
      if (team.sprintBoardId) {
        const allSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
        
        const sprintsToSync = syncYear
          ? allSprints.filter(sprint => {
              const sprintYear = new Date(sprint.startDate).getFullYear();
              return sprintYear === syncYear;
            })
          : allSprints;
        
        for (const dbSprint of sprintsToSync) {
          try {
            const sprintDetails = await kaitenClient.getSprint(dbSprint.sprintId);
            
            if (sprintDetails.cards && Array.isArray(sprintDetails.cards) && sprintDetails.cards.length > 0) {
              for (const sprintCard of sprintDetails.cards) {
                try {
                  const card = await kaitenClient.getCard(sprintCard.id);
                  
                  if (card.condition === 3) {
                    continue;
                  }
                  
                  let initCardId: number | null = null;
                  
                  if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
                    initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
                  } else {
                    initCardId = 0;
                  }
                  
                  let state: "1-queued" | "2-inProgress" | "3-done";
                  if (card.state === 3) {
                    state = "3-done";
                  } else if (card.state === 2) {
                    state = "2-inProgress";
                  } else {
                    state = "1-queued";
                  }
                  
                  const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
                  
                  await storage.syncTaskFromKaiten(
                    card.id,
                    card.board_id,
                    card.title,
                    card.created || new Date().toISOString(),
                    state,
                    card.size || 0,
                    condition,
                    card.archived || false,
                    initCardId,
                    card.type?.name,
                    card.completed_at ?? undefined,
                    dbSprint.sprintId,
                    card.last_moved_to_done_at ?? null,
                    team.teamId
                  );
                  
                  tasksSynced++;
                } catch (taskError) {
                  console.error(`[SMART-SYNC] Error syncing task ${sprintCard.id}:`, taskError instanceof Error ? taskError.message : String(taskError));
                }
              }
            }
          } catch (sprintError) {
            console.error(`[SMART-SYNC] Error sprint ${dbSprint.sprintId}:`, sprintError instanceof Error ? sprintError.message : String(sprintError));
          }
        }
      }
      
      
      res.json({
        success: true,
        initiativesSynced: syncedCount,
        tasksSynced
      });
    } catch (error) {
      console.error(`[SMART-SYNC] ERROR:`, error instanceof Error ? error.message : String(error));
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/metrics/innovation-rate", async (req, res) => {
    try {
      const teamIdsParam = req.query.teamIds as string;
      const yearParam = req.query.year as string;
      
      if (!teamIdsParam) {
        return res.status(400).json({ 
          success: false, 
          error: "teamIds parameter is required" 
        });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
      
      if (teamIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one team ID is required" 
        });
      }


      // Получаем команды и департамент
      const teams = await Promise.all(teamIds.map(id => storage.getTeamById(id)));
      const validTeams = teams.filter((t): t is NonNullable<typeof t> => t !== undefined);
      
      if (validTeams.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No valid teams found" 
        });
      }

      // Получаем департамент (все команды должны быть из одного департамента)
      const departmentId = validTeams[0].departmentId;
      const departments = await storage.getDepartments();
      const department = departments.find(d => d.id === departmentId);
      
      if (!department) {
        return res.status(404).json({ 
          success: false, 
          error: "Department not found" 
        });
      }

      // Фильтруем по году
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      
      // Получаем задачи из двух источников:
      // 1. Из реальных спринтов для команд со спринтами
      // 2. По doneDate для команд без спринтов
      const relevantTasks: TaskRow[] = [];
      const processedTaskIds = new Set<number>();
      
      for (const team of validTeams) {
        if (team.sprintBoardId !== null) {
          // Получаем спринты команды
          const teamSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
          const yearSprints = teamSprints.filter(sprint => {
            const sprintStart = new Date(sprint.startDate);
            return sprintStart >= yearStart && sprintStart <= yearEnd;
          });
          
          if (yearSprints.length > 0) {
            // Команда имеет реальные спринты в этом году - берем только done-задачи из спринтов
            const sprintIds = new Set(yearSprints.map(s => s.sprintId));
            const allTasks = await storage.getAllTasks();
            const teamSprintTasks = allTasks.filter(task => 
              task.teamId === team.teamId &&
              task.sprintId !== null && 
              sprintIds.has(task.sprintId) && 
              task.state === '3-done' &&  // Только done-задачи
              task.condition !== '3 - deleted' &&  // Исключаем удаленные
              !processedTaskIds.has(task.cardId)
            );
            teamSprintTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
          } else {
            // Команда не имеет реальных спринтов в этом году - берем по doneDate
            const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
            const newTasks = teamTasks.filter(task => task.condition !== '3 - deleted' && !processedTaskIds.has(task.cardId));
            newTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
          }
        } else {
          // Команда вообще без спринтовой доски - берем по doneDate
          const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
          const newTasks = teamTasks.filter(task => task.condition !== '3 - deleted' && !processedTaskIds.has(task.cardId));
          newTasks.forEach(task => {
            relevantTasks.push(task);
            processedTaskIds.add(task.cardId);
          });
        }
      }
      

      // Получаем все инициативы для выбранных команд
      const allInitiatives = await Promise.all(
        validTeams.map(team => storage.getInitiativesByBoardId(team.initBoardId))
      );
      const initiatives = allInitiatives.flat();
      
      // Создаем мапу инициатив по cardId для быстрого поиска
      const initiativesMap = new Map(initiatives.map(init => [init.cardId, init]));
      

      // Подсчитываем SP по типам (как в Cost Structure)
      const typeStats: Record<string, number> = {};
      let totalSP = 0;

      for (const task of relevantTasks) {
        const taskSize = task.size || 0;
        totalSP += taskSize;

        // Проверяем, привязан ли таск к инициативе
        if (task.initCardId !== null && task.initCardId !== 0) {
          const initiative = initiativesMap.get(task.initCardId);
          if (initiative && initiative.type) {
            typeStats[initiative.type] = (typeStats[initiative.type] || 0) + taskSize;
          }
        }
      }

      // Рассчитываем проценты для каждого типа (с округлением, как в Cost Structure)
      const epicPercent = totalSP > 0 ? Math.round(((typeStats['Epic'] || 0) / totalSP) * 100) : 0;
      const compliancePercent = totalSP > 0 ? Math.round(((typeStats['Compliance'] || 0) / totalSP) * 100) : 0;
      const enablerPercent = totalSP > 0 ? Math.round(((typeStats['Enabler'] || 0) / totalSP) * 100) : 0;
      
      // IR - это сумма округленных процентов (как в Excel)
      const actualIR = epicPercent + compliancePercent + enablerPercent;
      const innovationSP = (typeStats['Epic'] || 0) + (typeStats['Compliance'] || 0) + (typeStats['Enabler'] || 0);

      
      // Берём плановый IR из годовых данных команды (если есть), иначе из департамента
      let plannedIR = department.plannedIr || 0;
      if (validTeams.length === 1) {
        const teamYearly = await storage.getTeamYearlyData(validTeams[0].teamId, year);
        if (teamYearly && teamYearly.plannedIr !== null && teamYearly.plannedIr !== undefined) {
          plannedIR = teamYearly.plannedIr;
        }
      }
      const diffFromPlanned = actualIR - plannedIR;


      res.json({
        success: true,
        actualIR,
        plannedIR,
        diffFromPlanned,
        totalSP,
        innovationSP
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to calculate innovation rate" 
      });
    }
  });

  app.get("/api/metrics/cost-structure", async (req, res) => {
    try {
      const teamIdsParam = req.query.teamIds as string;
      const yearParam = req.query.year as string;
      
      if (!teamIdsParam) {
        return res.status(400).json({ 
          success: false, 
          error: "teamIds parameter is required" 
        });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
      
      if (teamIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one team ID is required" 
        });
      }


      // Получаем команды
      const teams = await Promise.all(teamIds.map(id => storage.getTeamById(id)));
      const validTeams = teams.filter((t): t is NonNullable<typeof t> => t !== undefined);
      
      if (validTeams.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No valid teams found" 
        });
      }

      // Фильтруем по году
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      
      // Получаем задачи из двух источников:
      // 1. Из реальных спринтов для команд со спринтами
      // 2. По doneDate для команд без спринтов
      const relevantTasks: TaskRow[] = [];
      const processedTaskIds = new Set<number>();
      
      for (const team of validTeams) {
        if (team.sprintBoardId !== null) {
          // Получаем спринты команды
          const teamSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
          const yearSprints = teamSprints.filter(sprint => {
            const sprintStart = new Date(sprint.startDate);
            return sprintStart >= yearStart && sprintStart <= yearEnd;
          });
          
          if (yearSprints.length > 0) {
            // Команда имеет реальные спринты в этом году - берем только done-задачи из спринтов
            const sprintIds = new Set(yearSprints.map(s => s.sprintId));
            const allTasks = await storage.getAllTasks();
            const teamSprintTasks = allTasks.filter(task => 
              task.teamId === team.teamId &&
              task.sprintId !== null && 
              sprintIds.has(task.sprintId) && 
              task.state === '3-done' &&  // Только done-задачи
              task.condition !== '3 - deleted' &&  // Исключаем удаленные
              !processedTaskIds.has(task.cardId)
            );
            teamSprintTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
          } else {
            // Команда не имеет реальных спринтов в этом году - берем по doneDate
            const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
            const newTasks = teamTasks.filter(task => task.condition !== '3 - deleted' && !processedTaskIds.has(task.cardId));
            newTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
          }
        } else {
          // Команда вообще без спринтовой доски - берем по doneDate
          const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
          const newTasks = teamTasks.filter(task => task.condition !== '3 - deleted' && !processedTaskIds.has(task.cardId));
          newTasks.forEach(task => {
            relevantTasks.push(task);
            processedTaskIds.add(task.cardId);
          });
        }
      }
      

      // Получаем все инициативы для выбранных команд
      const allInitiatives = await Promise.all(
        validTeams.map(team => storage.getInitiativesByBoardId(team.initBoardId))
      );
      const initiatives = allInitiatives.flat();
      
      // Создаем мапу инициатив по cardId для быстрого поиска
      const initiativesMap = new Map(initiatives.map(init => [init.cardId, init]));
      

      // Маппинг различных вариантов написания типов (применяется ко ВСЕМ задачам)
      const typeMapping: Record<string, string> = {
        'Omni': 'Service Desk',
        'Technical Debt': 'Tech debt',
        'Technical debt': 'Tech debt',
        'Tech Debt': 'Tech debt',
        'Tech debt': 'Tech debt',
        'Tech Task': 'Tech debt'
      };

      // Подсчитываем SP по типам инициатив
      const typeStats: Record<string, number> = {};
      let totalSP = 0;
      
      // Счетчики для отладки
      let tasksWithInitiative = 0;
      let tasksWithoutInitiative = 0;
      let techDebtCandidates = 0;

      for (const task of relevantTasks) {
        const taskSize = task.size || 0;
        totalSP += taskSize;

        // Проверяем, привязан ли таск к инициативе
        if (task.initCardId !== null && task.initCardId !== 0) {
          tasksWithInitiative++;
          const initiative = initiativesMap.get(task.initCardId);
          if (initiative && initiative.type) {
            // ТОЛЬКО считаем Epic, Compliance, Enabler инициативы (как в Excel)
            if (initiative.type === 'Epic' || initiative.type === 'Compliance' || initiative.type === 'Enabler') {
              typeStats[initiative.type] = (typeStats[initiative.type] || 0) + taskSize;
            }
          }
        } else {
          tasksWithoutInitiative++;
          // Таск не привязан к инициативе - используем тип задачи
          if (task.type) {
            
            // Применяем маппинг к типу задачи
            let displayType = task.type;
            if (typeMapping[task.type]) {
              displayType = typeMapping[task.type];
              if (displayType === 'Tech debt') {
                techDebtCandidates++;
              }
            }
            
            // Известные типы из структуры затрат
            const knownTypes = ['Security', 'Service Desk', 'Postmortem', 'Tech debt', 'Bug'];
            
            if (knownTypes.includes(displayType)) {
              typeStats[displayType] = (typeStats[displayType] || 0) + taskSize;
            } else {
              // Неизвестный тип - в "Др. доработки"
              typeStats['Др. доработки'] = (typeStats['Др. доработки'] || 0) + taskSize;
            }
          } else {
            // Нет типа - в "Др. доработки"
            typeStats['Др. доработки'] = (typeStats['Др. доработки'] || 0) + taskSize;
          }
        }
      }
      

      // Рассчитываем проценты
      const typePercentages: Record<string, number> = {};
      for (const [type, sp] of Object.entries(typeStats)) {
        typePercentages[type] = totalSP > 0 ? Math.round((sp / totalSP) * 100) : 0;
      }


      res.json({
        success: true,
        year,
        totalSP,
        typeStats,
        typePercentages,
        teams: validTeams.map(t => ({ id: t.teamId, name: t.teamName }))
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to calculate cost structure" 
      });
    }
  });

  app.get("/api/metrics/value-cost", async (req, res) => {
    try {
      const teamIdsParam = req.query.teamIds as string;
      const yearParam = req.query.year as string;
      
      if (!teamIdsParam) {
        return res.status(400).json({ 
          success: false, 
          error: "teamIds parameter is required" 
        });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
      
      if (teamIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one team ID is required" 
        });
      }

      // Получаем команды
      const teams = await Promise.all(teamIds.map(id => storage.getTeamById(id)));
      const validTeams = teams.filter((t): t is NonNullable<typeof t> => t !== undefined);
      
      if (validTeams.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No valid teams found" 
        });
      }

      const allTeamsForPrice = await storage.getAllTeams();
      const spPriceMap = await buildSpPriceMap(allTeamsForPrice);

      // Получаем инициативы для каждой команды с фильтрацией по спринтам команды (как в Excel)
      const initiativesWithSprints = await Promise.all(
        validTeams.map(async (team) => {
          // Получаем инициативы для этой команды
          const initiatives = await storage.getInitiativesByBoardId(team.initBoardId);
          
          // Определяем способ получения задач команды
          const yearStart = new Date(year, 0, 1);
          const yearEnd = new Date(year, 11, 31, 23, 59, 59);
          let useSprintFilter = false;
          let teamSprintIds = new Set<number>();
          
          if (team.sprintBoardId !== null) {
            const teamSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
            const filteredSprints = teamSprints.filter(sprint => {
              const sprintYear = new Date(sprint.startDate).getFullYear();
              return sprintYear === year;
            });
            if (filteredSprints.length > 0) {
              useSprintFilter = true;
              teamSprintIds = new Set(filteredSprints.map(s => s.sprintId));
              // log(`[Value/Cost] Team ${team.teamId}: using sprint filter with ${filteredSprints.length} sprints`);
            } else {
              // log(`[Value/Cost] Team ${team.teamId}: no sprints in year ${year}, using doneDate filter`);
            }
          } else {
            // log(`[Value/Cost] Team ${team.teamId}: no sprint board, using doneDate filter`);
          }
          
          // Для каждой инициативы получаем задачи, отфильтрованные по спринтам команды или по doneDate
          return Promise.all(
            initiatives.map(async (initiative) => {
              const allTasks = await storage.getTasksByInitCardId(initiative.cardId);
              
              // Фильтруем задачи в зависимости от типа команды (только done-задачи)
              let tasks: TaskRow[];
              if (useSprintFilter) {
                // Команда со спринтами - фильтруем по спринтам и только done-задачи
                tasks = allTasks.filter(task => 
                  task.sprintId !== null && 
                  teamSprintIds.has(task.sprintId) &&
                  task.state === '3-done' &&  // Только done-задачи
                  task.condition !== '3 - deleted'  // Исключаем удаленные
                );
              } else {
                // Команда без спринтов - фильтруем по doneDate и teamId (doneDate уже означает done)
                tasks = allTasks.filter(task => 
                  task.teamId === team.teamId && 
                  task.doneDate !== null &&
                  task.doneDate !== '' &&
                  new Date(task.doneDate) >= yearStart &&
                  new Date(task.doneDate) <= yearEnd &&
                  task.condition !== '3 - deleted'  // Исключаем удаленные
                );
              }
              
              // log(`[Value/Cost] Initiative ${initiative.cardId} "${initiative.title}": found ${allTasks.length} tasks total, ${tasks.length} tasks after filter (useSprintFilter=${useSprintFilter})`);
              
              // Группируем по sprint_id (для команд со спринтами) или используем виртуальный sprint_id (для команд без)
              const sprintsMap = new Map<number, { sp: number }>();
              tasks.forEach(task => {
                if (useSprintFilter) {
                  // Для команд со спринтами - группируем по реальному sprint_id
                  if (task.sprintId !== null) {
                    const current = sprintsMap.get(task.sprintId) || { sp: 0 };
                    current.sp += task.size;
                    sprintsMap.set(task.sprintId, current);
                  }
                } else {
                  // Для команд без спринтов - используем виртуальный sprint_id = -1
                  const virtualSprintId = -1;
                  const current = sprintsMap.get(virtualSprintId) || { sp: 0 };
                  current.sp += task.size;
                  sprintsMap.set(virtualSprintId, current);
                }
              });
              
              const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
                sprint_id,
                sp: data.sp,
              }));
              
              // Создаем новый объект с полями teamId, spPrice, teamName и sprints
              const yearlySpPrice = getSpPriceForYear(spPriceMap, team.teamId, year, team.spPrice);
              return {
                id: initiative.id,
                cardId: initiative.cardId,
                title: initiative.title,
                state: initiative.state,
                condition: initiative.condition,
                type: initiative.type,
                initBoardId: initiative.initBoardId,
                size: initiative.size,
                plannedInvolvement: initiative.plannedInvolvement,
                plannedValueId: initiative.plannedValueId,
                plannedValue: initiative.plannedValue,
                factValueId: initiative.factValueId,
                factValue: initiative.factValue,
                dueDate: initiative.doneDate,
                doneDate: initiative.doneDate,
                teamId: team.teamId,
                spPrice: yearlySpPrice,
                teamName: team.teamName,
                sprints: sprints
              };
            })
          );
        })
      );
      
      const allInitiatives = initiativesWithSprints.flat();
      
      // Группируем инициативы по cardId для исключения дубликатов
      // Применяем такую же фильтрацию, как в Excel отчёте (forReport=true)
      const initiativesByCardId = new Map<number, any[]>();
      allInitiatives.forEach((initiative) => {
        // Пропускаем "Поддержку бизнеса"
        if (initiative.cardId === 0) return;
        
        // Пропускаем архивные инициативы
        if (initiative.condition === "2-archived") return;
        
        // Оставляем только Epic, Compliance, Enabler
        if (initiative.type !== 'Epic' && initiative.type !== 'Compliance' && initiative.type !== 'Enabler') {
          return;
        }
        
        if (!initiativesByCardId.has(initiative.cardId)) {
          initiativesByCardId.set(initiative.cardId, []);
        }
        initiativesByCardId.get(initiative.cardId)!.push(initiative);
      });

      // log(`[Value/Cost] Found ${initiativesByCardId.size} unique initiatives`);

      // Рассчитываем суммарные значения
      let sumPlannedValue = 0;
      let sumPlannedCost = 0;
      let sumFactValue = 0;
      let sumFactCost = 0;

      for (const [cardId, relatedInitiatives] of Array.from(initiativesByCardId.entries())) {
        const firstInit = relatedInitiatives[0];
        
        // Фильтруем только инициативы выбранных команд
        const teamFilteredInitiatives = relatedInitiatives.filter(init => teamIds.includes(init.teamId));
        
        // Если после фильтрации не осталось инициатив - пропускаем
        if (teamFilteredInitiatives.length === 0) continue;
        
        // Плановый размер указывается один раз на весь эпик, не на каждую команду
        const plannedSize = firstInit.size || 0;
        
        // Суммируем фактические затраты по всем командам
        let totalActualCost = 0;
        let totalActualSp = 0;
        let weightedSpPrice = 0;
        
        for (const initiative of teamFilteredInitiatives) {
          // Actual size уже рассчитан в initiative.sprints
          const actualSize = initiative.sprints?.reduce((sum: number, sprint: any) => sum + sprint.sp, 0) || 0;
          
          totalActualCost += actualSize * (initiative.spPrice || 0);
          totalActualSp += actualSize;
          weightedSpPrice += actualSize * (initiative.spPrice || 0);
        }
        
        // Плановая стоимость = плановый размер * средневзвешенная цена SP
        const avgSpPrice = totalActualSp > 0 
          ? weightedSpPrice / totalActualSp 
          : firstInit.spPrice || 0;
        const totalPlannedCost = plannedSize * avgSpPrice;
        
        // Для Epic получаем plannedValue и factValue из БД
        // Для Compliance и Enabler: plannedValue = plannedCost, factValue = actualCost
        let plannedValue = 0;
        let factValue = 0;
        
        if (firstInit.type === 'Compliance' || firstInit.type === 'Enabler') {
          // Для Compliance/Enabler value всегда равен cost
          plannedValue = totalPlannedCost;
          factValue = totalActualCost;
        } else {
          // Для Epic берем из БД
          plannedValue = firstInit.plannedValue && firstInit.plannedValue.trim() !== '' 
            ? parseFloat(firstInit.plannedValue) 
            : 0;
          factValue = firstInit.factValue && firstInit.factValue.trim() !== '' 
            ? parseFloat(firstInit.factValue) 
            : 0;
        }
        
        // Добавляем только если есть ФАКТИЧЕСКИЕ затраты у выбранных команд
        if (totalActualCost > 0) {
          sumPlannedValue += plannedValue;
          sumPlannedCost += totalPlannedCost;
          sumFactValue += factValue;
          sumFactCost += totalActualCost;
        }
      }

      // Рассчитываем коэффициенты Value/Cost
      const plannedValueCost = sumPlannedCost > 0 
        ? Math.round((sumPlannedValue / sumPlannedCost) * 10) / 10
        : 0;
      const factValueCost = sumFactCost > 0 
        ? Math.round((sumFactValue / sumFactCost) * 10) / 10
        : 0;

      res.json({
        success: true,
        plannedValueCost,
        factValueCost,
        sumPlannedValue,
        sumPlannedCost,
        sumFactValue,
        sumFactCost
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to calculate value/cost" 
      });
    }
  });

  app.get("/api/metrics/initiatives-table", async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
      const teamIdsParam = req.query.teamIds as string;
      const yearParam = req.query.year as string;
      const filterParam = (req.query.filter as string) || 'all';
      const filterTeamIdsParam = req.query.filterTeamIds as string | undefined;

      if (!teamIdsParam) {
        return res.status(400).json({ success: false, error: "teamIds parameter is required" });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

      if (teamIds.length === 0) {
        return res.status(400).json({ success: false, error: "At least one team ID is required" });
      }

      const teams = await Promise.all(teamIds.map(id => storage.getTeamById(id)));
      const validTeams = teams.filter((t): t is NonNullable<typeof t> => t !== undefined);

      if (validTeams.length === 0) {
        return res.status(404).json({ success: false, error: "No valid teams found" });
      }

      const allTeamsForPrice = await storage.getAllTeams();
      const spPriceMap = await buildSpPriceMap(allTeamsForPrice);

      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);

      const prevYearStart = new Date(year - 1, 0, 1);
      const prevYearEnd = new Date(year - 1, 11, 31, 23, 59, 59);

      const initiativesByCardId = new Map<number, {
        title: string;
        type: string | null;
        size: number;
        state: string;
        cardId: number;
        spaceId: number | null;
        archived: boolean;
        plannedValue: string | null;
        factValue: string | null;
        totalPlannedCost: number;
        totalActualCost: number;
        totalPrevYearActualCost: number;
        teamContributions: Array<{ teamId: string; teamName: string; spPrice: number; actualSP: number }>;
      }>();

      for (const team of validTeams) {
        const allInitiativesForBoard = await storage.getInitiativesByBoardId(team.initBoardId);
        const allowedTypes = ['Epic', 'Compliance', 'Enabler'];
        
        // Сначала получаем задачи для ВСЕХ инициатив доски разом, чтобы фильтровать эффективно
        const initiatives = [];
        for (const init of allInitiativesForBoard) {
          if (init.type === null || !allowedTypes.includes(init.type)) continue;
          
          const allTasks = await storage.getTasksByInitCardId(init.cardId);
          const isArchived = init.condition === '2-archived' || init.condition === 'archived';
          const hasNoTasks = allTasks.length === 0;

          if (isArchived && hasNoTasks) {
            continue;
          }
          
          if (filterParam === 'done' && init.state !== '3-done') continue;
          if (filterParam === 'active' && init.state !== '2-inProgress') continue;
          
          initiatives.push(init);
        }

        let teamSprintIds: Set<number> | null = null;
        let prevYearSprintIds: Set<number> | null = null;
        let nextYearSprintIds: Set<number> | null = null;
        if (team.sprintBoardId !== null) {
          const allTeamSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
          const yearSprints = allTeamSprints.filter(sprint => {
            const sprintStart = new Date(sprint.startDate);
            return sprintStart >= yearStart && sprintStart <= yearEnd;
          });
          teamSprintIds = new Set(yearSprints.map(s => s.sprintId));

          prevYearSprintIds = new Set(allTeamSprints.filter(s => {
            const d = new Date(s.startDate);
            return d >= prevYearStart && d <= prevYearEnd;
          }).map(s => s.sprintId));

          if (filterParam === 'carryover' || filterParam === 'transferred' || filterParam === 'done') {
            const nextYearStartD = new Date(year + 1, 0, 1);
            const nextYearEndD = new Date(year + 1, 11, 31, 23, 59, 59);
            nextYearSprintIds = new Set(allTeamSprints.filter(s => {
              const d = new Date(s.startDate);
              return d >= nextYearStartD && d <= nextYearEndD;
            }).map(s => s.sprintId));
          }
        }

        for (const initiative of initiatives) {
          const allTasks = await storage.getTasksByInitCardId(initiative.cardId);
          const teamTasks = allTasks.filter(task => task.teamId === team.teamId);

          let tasks = teamTasks;
          if (teamSprintIds) {
            tasks = teamTasks.filter(task => task.sprintId !== null && teamSprintIds!.has(task.sprintId));
          }

          const hasDoneTasksInYear = tasks.some(task => task.state === '3-done' && task.condition !== '3 - deleted');
          const hasFactValue = initiative.factValue !== null && initiative.factValue !== "" && parseFloat(initiative.factValue) > 0;

          if (filterParam === 'backlog') {
            if (initiative.condition === '2-archived') continue;
            const hasAnyDoneTasks = allTasks.some(task => task.state === '3-done' && task.condition !== '3 - deleted');
            if (hasAnyDoneTasks) continue;
            if (hasFactValue) continue;
          } else {
          // Если карточка заархивирована и у нее НЕТ задач, скрываем ее из всех продуктовых метрик
            if (initiative.condition === '2-archived' && allTasks.length === 0) {
               continue;
            }
            // Для Эпиков показываем их, если есть задачи в году ИЛИ если есть факт. значение (чтобы видеть эффект)
            if (!hasDoneTasksInYear && !hasFactValue) continue;
          }

          const isDoneTask = (task: any) => task.state === '3-done' && task.condition !== '3 - deleted';

          const checkCarryover = () => {
            if (prevYearSprintIds) {
              return teamTasks.filter(task => task.sprintId !== null && prevYearSprintIds!.has(task.sprintId)).some(isDoneTask);
            }
            return teamTasks.some(task => isDoneTask(task) && task.doneDate && new Date(task.doneDate).getFullYear() === year - 1);
          };

          const checkTransferred = () => {
            if (nextYearSprintIds) {
              return teamTasks.filter(task => task.sprintId !== null && nextYearSprintIds!.has(task.sprintId)).some(isDoneTask);
            }
            return teamTasks.some(task => isDoneTask(task) && task.doneDate && new Date(task.doneDate).getFullYear() === year + 1);
          };

          if (filterParam === 'carryover') {
            if (!checkCarryover()) continue;
          }

          if (filterParam === 'transferred') {
            if (!checkTransferred()) continue;
          }

          if (filterParam === 'done') {
            if (!hasDoneTasksInYear) continue;
            if (checkCarryover() || checkTransferred()) continue;
          }

          let actualSP = 0;
          for (const task of tasks) {
            if (task.state === '3-done' && task.condition !== '3 - deleted') {
              actualSP += task.size || 0;
            }
          }

          let prevYearActualSP = 0;
          if (prevYearSprintIds) {
            const prevTasks = teamTasks.filter(task => task.sprintId !== null && prevYearSprintIds!.has(task.sprintId));
            for (const task of prevTasks) {
              if (task.state === '3-done' && task.condition !== '3 - deleted') {
                prevYearActualSP += task.size || 0;
              }
            }
          }

          const yearlySpPrice = getSpPriceForYear(spPriceMap, team.teamId, year, team.spPrice);
          const prevYearlySpPrice = getSpPriceForYear(spPriceMap, team.teamId, year - 1, team.spPrice);
          const existing = initiativesByCardId.get(initiative.cardId);
          if (existing) {
            existing.totalActualCost += actualSP * yearlySpPrice;
            existing.totalPrevYearActualCost += prevYearActualSP * prevYearlySpPrice;
            existing.teamContributions.push({
              teamId: team.teamId,
              teamName: team.teamName,
              spPrice: yearlySpPrice,
              actualSP,
            });
          } else {
            initiativesByCardId.set(initiative.cardId, {
              title: initiative.title,
              type: initiative.type,
              size: initiative.size,
              state: initiative.state,
              cardId: initiative.cardId,
              spaceId: team.spaceId,
              archived: initiative.condition === '2-archived',
              plannedValue: initiative.plannedValue,
              factValue: initiative.factValue,
              totalPlannedCost: 0,
              totalActualCost: actualSP * yearlySpPrice,
              totalPrevYearActualCost: prevYearActualSP * prevYearlySpPrice,
              teamContributions: [{
                teamId: team.teamId,
                teamName: team.teamName,
                spPrice: yearlySpPrice,
                actualSP,
              }],
            });
          }
        }
      }

      const result: Array<{
        title: string;
        type: string | null;
        cardId: number;
        spaceId: number;
        archived: boolean;
        plannedCost: number;
        prevYearActualCost: number;
        actualCost: number;
        plannedEffect: number | null;
        actualEffect: number | null;
        participants: string[];
      }> = [];

      for (const init of initiativesByCardId.values()) {
        const avgSpPrice = init.teamContributions.length > 0
          ? init.teamContributions.reduce((sum, tc) => sum + tc.spPrice, 0) / init.teamContributions.length
          : 0;

        const plannedCost = (init.size || 0) * avgSpPrice;
        const actualCost = init.totalActualCost;

        let plannedEffect: number | null = null;
        let actualEffect: number | null = null;

        if (init.type === 'Compliance' || init.type === 'Enabler') {
          plannedEffect = plannedCost;
          actualEffect = filterParam === 'carryover'
            ? actualCost + init.totalPrevYearActualCost
            : actualCost;
        } else {
          plannedEffect = init.plannedValue && init.plannedValue.trim() !== '' ? parseFloat(init.plannedValue) : null;
          actualEffect = init.factValue && init.factValue.trim() !== '' ? parseFloat(init.factValue) : null;
        }

        const allTasksForInit = await storage.getTasksByInitCardId(init.cardId);
        const uniqueTeamIds = [...new Set(allTasksForInit.map(t => t.teamId).filter(Boolean))];
        const participantNames: string[] = [];
        for (const tid of uniqueTeamIds) {
          const t = await storage.getTeamById(tid);
          if (t) participantNames.push(t.teamName);
        }
        const participants = participantNames;

        if (filterTeamIdsParam) {
          const filterTeamIds = filterTeamIdsParam.split(',').map(id => id.trim()).filter(Boolean);
          const hasMatchingParticipant = uniqueTeamIds.some(tid => filterTeamIds.includes(tid));
          if (!hasMatchingParticipant) continue;
        }

        result.push({
          title: init.title,
          type: init.type,
          cardId: init.cardId,
          spaceId: init.spaceId,
          archived: init.archived,
          plannedCost: Math.round(plannedCost),
          prevYearActualCost: Math.round(init.totalPrevYearActualCost),
          actualCost: Math.round(actualCost),
          plannedEffect,
          actualEffect,
          participants,
        });
      }

      result.sort((a, b) => {
        const typeOrder: Record<string, number> = { 'Epic': 0, 'Compliance': 1, 'Enabler': 2 };
        const aOrder = a.type ? (typeOrder[a.type] ?? 3) : 3;
        const bOrder = b.type ? (typeOrder[b.type] ?? 3) : 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.title.localeCompare(b.title);
      });

      res.json({
        success: true,
        year,
        initiatives: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch initiatives table data",
      });
    }
  });

  app.get("/api/metrics/team-sprint-stats", async (req, res) => {
    try {
      const teamId = req.query.teamId as string;
      const yearParam = req.query.year as string;

      if (!teamId) {
        return res.status(400).json({ success: false, error: "teamId parameter is required" });
      }

      const team = await storage.getTeamById(teamId);
      if (!team) {
        return res.status(404).json({ success: false, error: "Team not found" });
      }

      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);

      let avgVelocity: number | null = null;
      let avgSPD: number | null = null;

      if (team.sprintBoardId !== null) {
        const teamSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
        const yearSprints = teamSprints.filter(sprint => {
          const sprintStart = new Date(sprint.startDate);
          return sprintStart >= yearStart && sprintStart <= yearEnd;
        });

        if (yearSprints.length > 0) {
          let totalVelocity = 0;
          let totalSPD = 0;
          let sprintsWithSPD = 0;

          for (const sprint of yearSprints) {
            totalVelocity += sprint.velocity || 0;

            const sprintTasks = await storage.getTasksBySprint(sprint.sprintId);
            const sprintEndDate = sprint.actualFinishDate || sprint.finishDate;
            const sprintStartTime = new Date(sprint.startDate).getTime();
            const sprintEndTime = sprintEndDate ? new Date(sprintEndDate).getTime() : Date.now();

            let totalSP = 0;
            let doneSP = 0;

            for (const task of sprintTasks) {
              totalSP += task.size || 0;
              if (task.state === '3-done' && task.condition !== '3 - deleted') {
                if (task.doneDate) {
                  const taskDoneTime = new Date(task.doneDate).getTime();
                  if (taskDoneTime >= sprintStartTime && taskDoneTime <= sprintEndTime) {
                    doneSP += task.size || 0;
                  }
                }
              }
            }

            if (totalSP > 0) {
              totalSPD += Math.round((doneSP / totalSP) * 100);
              sprintsWithSPD++;
            }
          }

          avgVelocity = Math.round(totalVelocity / yearSprints.length * 10) / 10;
          avgSPD = sprintsWithSPD > 0 ? Math.round(totalSPD / sprintsWithSPD) : 0;
        }
      }

      res.json({
        success: true,
        avgVelocity,
        avgSPD,
        year,
        teamId,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to calculate team sprint stats",
      });
    }
  });

  // Динамика метрик по спринтам для графиков
  app.get("/api/metrics/dynamics", async (req, res) => {
    try {
      const teamId = req.query.teamId as string;
      const yearParam = req.query.year as string;
      
      if (!teamId) {
        return res.status(400).json({ 
          success: false, 
          error: "teamId parameter is required" 
        });
      }

      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
      
      const team = await storage.getTeamById(teamId);
      if (!team) {
        return res.status(404).json({ 
          success: false, 
          error: "Team not found" 
        });
      }

      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);

      // Получаем инициативы команды
      const initiatives = await storage.getInitiativesByBoardId(team.initBoardId);
      const initiativesMap = new Map(initiatives.map(init => [init.cardId, init]));
      
      const metricsData: Array<{
        sprintId: number;
        sprintTitle: string;
        startDate: string;
        finishDate: string;
        velocity: number;
        innovationRate: number;
        deliveryPlanCompliance: number;
      }> = [];

      if (team.sprintBoardId) {
        // Команда со спринтами
        const sprints = await storage.getSprintsByBoardId(team.sprintBoardId);
        const now = new Date();
        const yearSprints = sprints
          .filter(sprint => {
            const sprintStart = new Date(sprint.startDate);
            const sprintFinish = new Date(sprint.finishDate);
            return sprintStart >= yearStart && sprintStart <= yearEnd && sprintFinish < now;
          })
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        for (const sprint of yearSprints) {
          const allTasks = await storage.getTasksBySprint(sprint.sprintId);
          
          // Фильтруем задачи по doneDate внутри спринта
          const sprintEndDate = sprint.actualFinishDate || sprint.finishDate;
          const sprintStartTime = new Date(sprint.startDate).getTime();
          const sprintEndTime = sprintEndDate ? new Date(sprintEndDate).getTime() : Date.now();
          
          let totalSP = 0;
          let doneSP = 0;
          let innovationSP = 0;
          
          for (const task of allTasks) {
            const taskSize = task.size || 0;
            totalSP += taskSize;
            
            // Done tasks inside sprint dates
            if (task.state === '3-done' && task.condition !== '3 - deleted') {
              if (task.doneDate) {
                const taskDoneTime = new Date(task.doneDate).getTime();
                if (taskDoneTime >= sprintStartTime && taskDoneTime <= sprintEndTime) {
                  doneSP += taskSize;
                  
                  // Check if task is from innovation initiative
                  if (task.initCardId) {
                    const init = initiativesMap.get(task.initCardId);
                    if (init && (init.type === 'Epic' || init.type === 'Compliance' || init.type === 'Enabler')) {
                      innovationSP += taskSize;
                    }
                  }
                }
              }
            }
          }
          
          const velocity = doneSP;
          const innovationRate = doneSP > 0 ? Math.round((innovationSP / doneSP) * 100) : 0;
          const deliveryPlanCompliance = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;
          
          metricsData.push({
            sprintId: sprint.sprintId,
            sprintTitle: sprint.title || `Sprint ${sprint.sprintId}`,
            startDate: sprint.startDate,
            finishDate: sprint.finishDate,
            velocity,
            innovationRate,
            deliveryPlanCompliance
          });
        }
      } else {
        // Команда без спринтов - группируем по месяцам
        const tasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
        const doneTasks = tasks.filter(t => t.state === '3-done' && t.condition !== '3 - deleted');
        
        // Группируем по месяцам
        const monthlyData = new Map<string, { totalSP: number; doneSP: number; innovationSP: number }>();
        
        for (let month = 0; month < 12; month++) {
          const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
          monthlyData.set(monthKey, { totalSP: 0, doneSP: 0, innovationSP: 0 });
        }
        
        for (const task of doneTasks) {
          if (task.doneDate) {
            const doneDate = new Date(task.doneDate);
            const monthKey = `${doneDate.getFullYear()}-${String(doneDate.getMonth() + 1).padStart(2, '0')}`;
            const data = monthlyData.get(monthKey);
            if (data) {
              const taskSize = task.size || 0;
              data.totalSP += taskSize;
              data.doneSP += taskSize;
              
              if (task.initCardId) {
                const init = initiativesMap.get(task.initCardId);
                if (init && (init.type === 'Epic' || init.type === 'Compliance' || init.type === 'Enabler')) {
                  data.innovationSP += taskSize;
                }
              }
            }
          }
        }
        
        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        const now = new Date();
        
        Array.from(monthlyData.entries()).forEach(([monthKey, data]) => {
          const [yearStr, monthStr] = monthKey.split('-');
          const monthIndex = parseInt(monthStr) - 1;
          const monthFinishDate = new Date(parseInt(yearStr), monthIndex + 1, 0);
          
          if (monthFinishDate >= now) {
            return;
          }
          
          const velocity = data.doneSP;
          const innovationRate = data.doneSP > 0 ? Math.round((data.innovationSP / data.doneSP) * 100) : 0;
          const deliveryPlanCompliance = data.totalSP > 0 ? Math.round((data.doneSP / data.totalSP) * 100) : 100;
          
          metricsData.push({
            sprintId: -monthIndex - 1,
            sprintTitle: monthNames[monthIndex],
            startDate: new Date(parseInt(yearStr), monthIndex, 1).toISOString(),
            finishDate: new Date(parseInt(yearStr), monthIndex + 1, 0).toISOString(),
            velocity,
            innovationRate,
            deliveryPlanCompliance
          });
        });
      }

      res.json({
        success: true,
        teamId,
        year,
        hasSprints: !!team.sprintBoardId,
        data: metricsData
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to get metrics dynamics" 
      });
    }
  });

  app.get("/api/kaiten/sprint-raw/:sprintId", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      
      const sprint = await kaitenClient.getSprint(sprintId);
      
      
      res.json(sprint);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch sprint from Kaiten" 
      });
    }
  });

  app.get("/api/kaiten/test", async (req, res) => {
    try {
      const isConnected = await kaitenClient.testConnection();
      res.json({ 
        success: true, 
        connected: isConnected,
        message: isConnected ? "Kaiten API connection successful" : "Kaiten API connection failed"
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to test Kaiten connection" 
      });
    }
  });

  app.post("/api/sprints/:sprintId/generate-report", async (req, res) => {
    try {
      const { sprintId } = req.params;
      const { teamName, sprintDates, teamId } = req.body;

      const sprintIdNum = parseInt(sprintId);
      
      // Получаем задачи спринта
      let tasks: TaskRow[];
      
      if (sprintIdNum < 0) {
        // Виртуальный спринт - выбираем задачи по команде и диапазону дат
        if (!teamId || typeof teamId !== 'string') {
          return res.status(400).json({ 
            success: false, 
            error: 'teamId is required for virtual sprints' 
          });
        }
        
        if (!sprintDates?.start || !sprintDates?.end) {
          return res.status(400).json({ 
            success: false, 
            error: 'sprintDates.start and sprintDates.end are required for virtual sprints' 
          });
        }
        
        const startDate = new Date(sprintDates.start);
        const endDate = new Date(sprintDates.end);
        
        // Проверяем валидность дат
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid date format in sprintDates' 
          });
        }
        
        tasks = await storage.getTasksByTeamAndDoneDateRange(teamId, startDate, endDate);
      } else {
        // Реальный спринт - выбираем по sprint_id
        tasks = await storage.getTasksBySprint(sprintIdNum);
      }
      
      // Получаем инициативы для группировки
      const initiativeMap = new Map<number, { title: string; tasks: Array<{ title: string; size: number }> }>();
      
      for (const task of tasks) {
        const initCardId = task.initCardId || 0;
        
        if (!initiativeMap.has(initCardId)) {
          if (initCardId === 0) {
            initiativeMap.set(0, { title: 'Другие задачи', tasks: [] });
          } else {
            const initiative = await storage.getInitiativeByCardId(initCardId);
            initiativeMap.set(initCardId, {
              title: initiative?.title || `Инициатива ${initCardId}`,
              tasks: []
            });
          }
        }
        
        initiativeMap.get(initCardId)!.tasks.push({
          title: task.title,
          size: task.size
        });
      }

      // Преобразуем Map в массив и сортируем: сначала инициативы, потом "Другие задачи"
      const initiatives = Array.from(initiativeMap.entries())
        .sort(([idA], [idB]) => {
          // Если ID = 0 (Другие задачи), помещаем в конец
          if (idA === 0) return 1;
          if (idB === 0) return -1;
          return 0; // Остальные инициативы сохраняют исходный порядок
        })
        .map(([_, initiative]) => initiative);

      // Динамически импортируем модуль генерации PDF
      const { generateSprintReportPDF } = await import('./pdf-generator');
      const pdfBuffer = await generateSprintReportPDF(teamName, sprintDates, initiatives);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Sprint_Report_${sprintId}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to generate report" 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
