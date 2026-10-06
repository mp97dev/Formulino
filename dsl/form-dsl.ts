
/**
 * =========================
 * FORM DSL v1 - LLM GENERATION SCHEMA
 * =========================
 *
 * Purpose:
 * - Define a strict, simple structure for forms/quizzes
 * - Used as output format for LLM
 * - Used as input for Google Forms API mapper
 *
 * Rules:
 * - No branching logic
 * - Sequential pages only
 * - Simple quiz support (correctAnswer + score)
 */

/* =========================
   TYPES
========================= */

/**
 * FormMode:
 * - "form" → standard survey (no scoring)
 * - "quiz" → teacher quiz mode (uses correct answers + scoring)
 */
export type FormMode = "form" | "quiz";

/**
 * QuestionType:
 * Defines allowed question formats
 */
export type QuestionType =
  | "text"            // free text input
  | "multiple_choice" // single correct option
  | "checkbox"        // multiple selections allowed
  | "dropdown"        // select from list
  | "true_false"      // boolean question
  | "short_answer";   // short text response

/**
 * MediaType:
 * Supported media attachments (all via URL only)
 */
export type MediaType = "image" | "video" | "audio";

/* =========================
   MEDIA
========================= */

/**
 * Media attached to a question
 *
 * type:
 * - image → displayed with question
 * - video → typically YouTube URL
 * - audio → external audio URL
 *
 * url:
 * - direct public URL to resource
 */
export interface Media {
  type: MediaType;
  url: string;
}

/* =========================
   SETTINGS
========================= */

/**
 * Form-level settings
 */
export interface FormSettings {

  /**
   * If true → Google Forms collects user email automatically
   */
  collectEmails: boolean;

  /**
   * If true → user can submit only once
   */
  limitOneResponse: boolean;

  /**
   * If true → questions are shuffled per user
   * (Note: global shuffle, no per-page logic)
   */
  shuffleQuestions: boolean;
}

/* =========================
   QUESTION
========================= */

/**
 * Core unit of the form
 */
export interface Question {

  /**
   * Unique identifier for the question
   * Used for:
   * - mapping
   * - updates
   * - LLM consistency
   */
  id: string;

  /**
   * Type of question (see QuestionType)
   */
  type: QuestionType;

  /**
   * Question text shown to user
   */
  title: string;

  /**
   * Whether question is mandatory
   */
  required: boolean;

  /**
   * Options for selection-based questions:
   * - multiple_choice
   * - checkbox
   * - dropdown
   */
  options?: string[];

  /**
   * Correct answer (ONLY used in quiz mode)
   * Ignored in form mode
   */
  correctAnswer?: string;

  /**
   * Score assigned if answer is correct
   * Default = 1 if not provided
   * Only relevant in quiz mode
   */
  score?: number;

  /**
   * Optional media attached to question
   * Displayed alongside question
   */
  media?: Media;

  /**
   * Optional metadata for LLM / analytics
   * NOT used by Google Forms
   */
  metadata?: {
    /**
     * Topic classification (e.g. math, physics)
     */
    topic?: string;

    /**
     * Difficulty level of question
     */
    difficulty?: "easy" | "medium" | "hard";
    /** Text describing a figure the teacher must add manually */
    imageHint?: string;
    /** How faithful the AI output is to the source (informational, not sent to Google) */
    fidelity?: "literal" | "interpreted" | "answer_inferred";
  };
}

/* =========================
   PAGE
========================= */

/**
 * Page = logical grouping of questions
 *
 * IMPORTANT:
 * - Pages are sequential only
 * - No branching / conditional navigation
 */
export interface Page {

  /**
   * Unique page identifier
   */
  id: string;

  /**
   * Title shown as section header in form
   */
  title: string;

  /**
   * Questions inside this page
   */
  questions: Question[];
}

/* =========================
   FORM ROOT
========================= */

/**
 * Root object representing full form/quiz
 */
export interface Form {

  /**
   * Unique form identifier
   */
  id: string;

  /**
   * Form title shown at top of Google Form
   */
  title: string;

  /**
   * Description shown under title
   */
  description: string;

  /**
   * Mode determines behavior:
   * - form → survey
   * - quiz → grading enabled
   */
  mode: FormMode;

  /**
   * Global settings applied to entire form
   */
  settings: FormSettings;

  /**
   * Sequential pages of the form
   */
  pages: Page[];
}

/* =========================
   DEFAULTS
========================= */

/**
 * Default settings used if LLM omits them
 */
export const defaultSettings: FormSettings = {
  collectEmails: true,
  limitOneResponse: false,
  shuffleQuestions: false,
};

/* =========================
   HELPERS (minimal logic only)
========================= */

/**
 * Checks if form is in quiz mode
 */
export function isQuiz(form: Form): boolean {
  return form.mode === "quiz";
}

/**
 * Normalizes question values:
 * - ensures score defaults to 1
 * - keeps structure safe for mapping layer
 */
export function normalizeQuestion(q: Question): Question {
  return {
    ...q,
    score: q.score ?? 1,
    required: q.required ?? false,
  };
}

/* =========================
   EXAMPLE (LLM OUTPUT SAMPLE)
========================= */

/**
 * Example of valid LLM-generated form
 */
export const exampleForm: Form = {
  id: "form_1",
  title: "Physics Quiz",
  description: "Chapter 1 assessment",
  mode: "quiz",
  settings: defaultSettings,
  pages: [
    {
      id: "page_1",
      title: "Basics",
      questions: [
        {
          id: "q_1",
          type: "multiple_choice",
          title: "What is 2 + 2?",
          required: true,
          options: ["1", "2", "3", "4"],
          correctAnswer: "4",
          score: 1,
          metadata: {
            topic: "math",
            difficulty: "easy",
          },
        },
      ],
    },
  ],
};