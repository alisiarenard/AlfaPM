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

      // Регистрируем шрифты DejaVu из npm пакета dejavu-fonts-ttf
      const dejavuFontsPath = path.dirname(require.resolve('dejavu-fonts-ttf'));
      doc.registerFont('DejaVu', path.join(dejavuFontsPath, 'ttf', 'DejaVuSans.ttf'));
      doc.registerFont('DejaVu-Bold', path.join(dejavuFontsPath, 'ttf', 'DejaVuSans-Bold.ttf'));

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
        // Название инициативы
        doc.font('DejaVu-Bold').fontSize(14).text(initiative.title);
        doc.moveDown(0.5);

        // Сокращаем формулировки задач через AI
        const shortenedTasks = await shortenTasksWithAI(initiative.tasks);

        // Выводим задачи
        for (const task of shortenedTasks) {
          let taskText = `• ${task.shortened}`;
          
          // Добавляем метки (back)/(front)
          if (task.hasBack) {
            taskText += ' (back)';
          }
          if (task.hasFront) {
            taskText += ' (front)';
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

async function shortenTasksWithAI(tasks: Task[]): Promise<Array<{ shortened: string; hasBack: boolean; hasFront: boolean }>> {
  try {
    // Если задач мало, обрабатываем все сразу; если много - батчами по 20
    const batchSize = 20;
    const results: Array<{ shortened: string; hasBack: boolean; hasFront: boolean }> = [];
    
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const tasksText = batch.map(t => t.title).join('\n');
      
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
        const shortened = shortenedLines[idx] || task.title;
        const titleLower = task.title.toLowerCase();
        
        results.push({
          shortened,
          hasBack: titleLower.includes('back') || titleLower.includes('бэк'),
          hasFront: titleLower.includes('front') || titleLower.includes('фронт'),
        });
      });
      
      // Задержка между батчами, чтобы не превысить rate limit
      if (i + batchSize < tasks.length) {
        await sleep(21000); // 21 секунда между батчами
      }
    }
    
    return results;
  } catch (error) {
    console.error('AI shortening error:', error);
    // Fallback: возвращаем оригинальные тексты
    return tasks.map(task => {
      const titleLower = task.title.toLowerCase();
      return {
        shortened: task.title,
        hasBack: titleLower.includes('back') || titleLower.includes('бэк'),
        hasFront: titleLower.includes('front') || titleLower.includes('фронт'),
      };
    });
  }
}
