export interface Question {
  id: string | number;
  type?: 'basic' | 'advanced';
  knowledge_ids?: string[];
  year?: string;
  prefecture?: string;
  field: string;
  difficulty: string | number; // "1", "2", "3", "4" または 1, 2, 3, 4
  question: string;
  choices: string[];
  answer: number; // 1-indexed
  explanation: string;
}

export type QuizQuestion = Question;

export interface UserStats {
  totalAttempted: number;
  correctCount: number;
  incorrectCount: number;
  accuracyRate: number;
}

export interface UserProfile {
  grade: string;
  department: string;
  diaryName: string;
  dailyReminderTime?: string; // "HH:mm" (例: "20:00")
}

export type MainMode = 'past' | 'expected' | 'ai' | 'review' | 'admin' | 'report' | 'pdf-maker';

export const formatKouAndGou = (text: string): string => {
  return text; // 自動改行は行わず、データ(questions.ts)内の <br> を尊重します
};

export const formatBlanks = (text: string): string => {
  // Match various parenthesis types containing possible content or empty/spaces
  // Captures the content inside brackets (if any)
  return text.replace(/[（(\[［]\s*　*\s*([a-zA-ZＡ-Ｚ0-9ア-ン①-⑳一-龠]?)\s*　*\s*[）)\]］]/g, (match, content) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return `（　　）`;
    }
    return `（　${trimmedContent}　）`;
  });
};

