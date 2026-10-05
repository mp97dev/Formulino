// Local re-export of DSL types used by the backend.
// Defined here to avoid TypeScript rootDir issues when the dsl/ package
// lives outside the backend/ rootDir.

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
    imageHint?: string;
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
