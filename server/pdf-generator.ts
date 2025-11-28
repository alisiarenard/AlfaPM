import PDFDocument from 'pdfkit';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AI Configuration
const AI_API_KEY = process.env.OPENAI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const AI_BASE_URL = process.env.AI_BASE_URL || undefined;

const openai = new OpenAI({
  apiKey: AI_API_KEY,
  baseURL: AI_BASE_URL,
});

interface Task {
  title: string;
  size: number;
}

interface InitiativeWithTasks {
  title: string;
  tasks: Task[];
}

// Проверяет, нужно ли исключить задачу из отчета (содержит [QA], [AQA], [Design])
function shouldExcludeTask(title: string): boolean {
  return /\[(QA|AQA|Design)\]/i.test(title);
}

export async function generateSprintReportPDF(
  teamName: string,
  sprintDates: string | { start: string; end: string },
  initiatives: InitiativeWithTasks[]
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Регистрируем шрифты DejaVu из локальной папки проекта
      const fontPath = path.join(__dirname, 'fonts');
      doc.registerFont('DejaVu', path.join(fontPath, 'DejaVuSans.ttf'));
      doc.registerFont('DejaVu-Bold', path.join(fontPath, 'DejaVuSans-Bold.ttf'));

      // Форматируем даты для отображения
      let formattedDates: string;
      if (typeof sprintDates === 'object') {
        // Виртуальный спринт - форматируем даты из объекта в формате DD.MM.YYYY
        const formatDate = (dateStr: string) => {
          const date = new Date(dateStr);
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          return `${day}.${month}.${year}`;
        };
        formattedDates = `${formatDate(sprintDates.start)} - ${formatDate(sprintDates.end)}`;
      } else {
        // Реальный спринт - используем готовую строку
        formattedDates = sprintDates;
      }

      // Заголовок отчета
      doc.font('DejaVu-Bold').fontSize(16).text(`Отчет по спринту`, { align: 'center' });
      doc.moveDown(0.5);
      doc.font('DejaVu').fontSize(12).text(`Команда ${teamName} в спринте ${formattedDates} выполнила следующие задачи:`, { align: 'left' });
      doc.moveDown(1);

      // Обрабатываем каждую инициативу
      for (const initiative of initiatives) {
        // Фильтруем задачи - исключаем [QA], [AQA], [Design]
        const filteredTasks = initiative.tasks.filter(task => !shouldExcludeTask(task.title));
        
        // Пропускаем инициативу если после фильтрации не осталось задач
        if (filteredTasks.length === 0) {
          continue;
        }
        
        // Название инициативы
        doc.font('DejaVu-Bold').fontSize(14).text(initiative.title);
        doc.moveDown(0.5);

        // Сокращаем формулировки задач через AI
        const shortenedTasks = await shortenTasksWithAI(filteredTasks);

        // Выводим задачи
        for (const task of shortenedTasks) {
          let taskText = `• ${task.shortened}`;
          
          // Добавляем метки (бэк)/(фронт)
          if (task.hasBack) {
            taskText += ' (бэк)';
          }
          if (task.hasFront) {
            taskText += ' (фронт)';
          }

          doc.font('DejaVu').fontSize(11).text(taskText, { indent: 20 });
        }

        doc.moveDown(1);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Предобработка названия задачи: убирает теги [BACK], [FRONT] и возвращает очищенный текст + флаги
function preprocessTaskTitle(title: string): { cleanTitle: string; hasBack: boolean; hasFront: boolean } {
  let cleanTitle = title;
  let hasBack = false;
  let hasFront = false;
  
  // Проверяем наличие тегов [BACK], [Back], [back]
  if (/\[back\]/i.test(cleanTitle)) {
    hasBack = true;
    cleanTitle = cleanTitle.replace(/\[back\]/gi, '').trim();
  }
  
  // Проверяем наличие тегов [FRONT], [Front], [front]
  if (/\[front\]/i.test(cleanTitle)) {
    hasFront = true;
    cleanTitle = cleanTitle.replace(/\[front\]/gi, '').trim();
  }
  
  // Также проверяем другие варианты в тексте (без скобок)
  const titleLower = title.toLowerCase();
  if (titleLower.includes('бэк') || (titleLower.includes('back') && !hasBack)) {
    hasBack = true;
  }
  if (titleLower.includes('фронт') || (titleLower.includes('front') && !hasFront)) {
    hasFront = true;
  }
  
  // Убираем лишние пробелы
  cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
  
  return { cleanTitle, hasBack, hasFront };
}

async function shortenTasksWithAI(tasks: Task[]): Promise<Array<{ shortened: string; hasBack: boolean; hasFront: boolean }>> {
  try {
    // Предобрабатываем все задачи
    const preprocessedTasks = tasks.map(task => ({
      original: task,
      ...preprocessTaskTitle(task.title)
    }));
    
    // Если задач мало, обрабатываем все сразу; если много - батчами по 20
    const batchSize = 20;
    const results: Array<{ shortened: string; hasBack: boolean; hasFront: boolean }> = [];
    
    for (let i = 0; i < preprocessedTasks.length; i += batchSize) {
      const batch = preprocessedTasks.slice(i, i + batchSize);
      // Отправляем в AI уже очищенные названия
      const tasksText = batch.map(t => t.cleanTitle).join('\n');
      
      const prompt = `Сократи задачи до 5-7 слов каждую, сохраняя суть. Отвечай только сокращенными формулировками (одна на строке, без нумерации):\n\n${tasksText}`;

      // Retry logic для обработки rate limit
      let retries = 0;
      let response;
      
      while (retries < 3) {
        try {
          response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: 'system', content: 'Сокращай задачи до 5-7 слов, сохраняя суть.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 500,
          });
          break; // Успешно выполнили запрос
        } catch (err: any) {
          if (err.status === 429 && retries < 2) {
            // Rate limit - ждем и повторяем
            const waitTime = (retries + 1) * 20000; // 20s, 40s
            console.log(`Rate limit hit, waiting ${waitTime}ms before retry ${retries + 1}/2`);
            await sleep(waitTime);
            retries++;
          } else {
            throw err; // Другая ошибка или исчерпаны попытки
          }
        }
      }

      if (!response) {
        throw new Error('Failed to get AI response after retries');
      }

      const shortenedText = response.choices[0]?.message?.content || '';
      const shortenedLines = shortenedText.split('\n').filter(line => line.trim());

      batch.forEach((task, idx) => {
        // Используем очищенное название как fallback если AI не вернул результат
        const shortened = shortenedLines[idx] || task.cleanTitle;
        
        results.push({
          shortened,
          hasBack: task.hasBack,
          hasFront: task.hasFront,
        });
      });
      
      // Задержка между батчами, чтобы не превысить rate limit
      if (i + batchSize < preprocessedTasks.length) {
        await sleep(21000); // 21 секунда между батчами
      }
    }
    
    return results;
  } catch (error) {
    console.error('AI shortening error:', error);
    // Fallback: возвращаем очищенные тексты с флагами из предобработки
    return tasks.map(task => {
      const { cleanTitle, hasBack, hasFront } = preprocessTaskTitle(task.title);
      return {
        shortened: cleanTitle,
        hasBack,
        hasFront,
      };
    });
  }
}
