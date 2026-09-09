// Local mirror of the DSL types used by the backend (backend/src/forms/dsl-types.ts).
// Kept in sync manually since the frontend and backend are separate npm workspaces.

export type FormMode = 'form' | 'quiz';

export type QuestionType =
  | 'text'
  | 'multiple_choice'
  | 'checkbox'
  | 'dropdown'
  | 'true_false'
  | 'short_answer';

export type MediaType = 'image' | 'video';

export interface Media {
  type: MediaType;
  url: string;
}

export interface FormSettings {
  collectEmails: boolean;
  limitOneResponse: boolean;
  shuffleQuestions: boolean;
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  required: boolean;
  options?: string[];
  correctAnswer?: string;
  score?: number;
  media?: Media;
  metadata?: {
    topic?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  };
}

export interface Page {
  id: string;
  title: string;
  questions: Question[];
}

export interface Form {
  id: string;
  title: string;
  description: string;
  mode: FormMode;
  settings: FormSettings;
  pages: Page[];
}

export const OPTION_QUESTION_TYPES: QuestionType[] = ['multiple_choice', 'checkbox', 'dropdown'];
