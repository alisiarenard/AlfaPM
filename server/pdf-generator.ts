import PDFDocument from 'pdfkit';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
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
  sprintDates: string,
  initiatives: InitiativeWithTasks[]
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Заголовок отчета
      doc.fontSize(16).text(`Отчет по спринту`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Команда ${teamName} в спринте ${sprintDates} выполнила следующие задачи:`, { align: 'left' });
      doc.moveDown(1);

      // Обрабатываем каждую инициативу
      for (const initiative of initiatives) {
        // Название инициативы
        doc.fontSize(14).text(initiative.title, { underline: true });
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

          doc.fontSize(11).text(taskText, { indent: 20 });
        }

        doc.moveDown(1);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function shortenTasksWithAI(tasks: Task[]): Promise<Array<{ shortened: string; hasBack: boolean; hasFront: boolean }>> {
  try {
    const tasksText = tasks.map(t => t.title).join('\n');
    
    const prompt = `Сократи следующие формулировки задач до более краткого вида, сохраняя суть. Каждую задачу выведи на новой строке в том же порядке. Не добавляй нумерацию или маркеры:\n\n${tasksText}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Ты помощник, который сокращает формулировки задач, сохраняя их смысл. Отвечай только сокращенными формулировками без нумерации.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
    });

    const shortenedText = response.choices[0]?.message?.content || '';
    const shortenedLines = shortenedText.split('\n').filter(line => line.trim());

    return tasks.map((task, idx) => {
      const shortened = shortenedLines[idx] || task.title;
      const titleLower = task.title.toLowerCase();
      
      return {
        shortened,
        hasBack: titleLower.includes('back') || titleLower.includes('бэк'),
        hasFront: titleLower.includes('front') || titleLower.includes('фронт'),
      };
    });
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
