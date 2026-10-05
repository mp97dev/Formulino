export type PromptMode = 'generate' | 'extract';

const OUTPUT_SPEC = `OUTPUT FORMAT
Reply with exactly ONE fenced code block tagged json and nothing outside it: no greeting, no explanation.
The block content starts directly with { and is valid, pretty-printed JSON (double quotes, no comments, no trailing commas). It is a plain JSON object, NOT a string: never escape the quotes (no \\" anywhere) and never wrap the object in quotes.
Use ONLY the keys listed below. Do NOT add any other key (no "id", "explanation", "hint", "points", "answer", "settings", ...): unknown keys are discarded.
{
  "title": "string",
  "description": "string",
  "mode": "form" | "quiz",
  "pages": [
    {
      "title": "string",
      "questions": [
        {
          "type": "multiple_choice" | "checkbox" | "dropdown" | "true_false" | "short_answer" | "text",
          "title": "string",
          "required": true | false,
          "options": ["string"],
          "correctAnswer": "string",
          "score": 1,
          "imageHint": "string"
        }
      ]
    }
  ]
}
FIELDS PER QUESTION TYPE (always write "type", "title" and "required")
- multiple_choice, dropdown: add "options" (at least 2). In a quiz also add "correctAnswer" and "score".
- checkbox: add "options" (at least 2). In a quiz also add "correctAnswer" (the single best option) and "score".
- true_false: add "options" written in the form's language (e.g. ["Vero","Falso"]). In a quiz also add "correctAnswer" and "score".
- short_answer (one line) and text (long paragraph): NEVER add "options". In a quiz you may add "correctAnswer" and "score".
- "imageHint" only when the question depends on a picture; otherwise leave it out.
- "description" may be an empty string.
RULES
- "mode" is "quiz" as soon as the request or the source mentions correct answers, grades, scores or an answer key; otherwise "form". In "quiz" mode EVERY question that has options MUST have "correctAnswer" and "score".
- "correctAnswer" must be copied character by character from one of the "options" (never a letter like "B", never a number, never a paraphrase).
- Use a single page unless the content has clearly separate sections.
- Write all texts in the language of the content (Italian if unsure). Plain text only: no Markdown, no LaTeX (write x², √, ½ with Unicode characters).
EXAMPLE OF A VALID REPLY (a quiz with two questions; your content will be different)
\`\`\`json
{
  "title": "Verifica di storia",
  "description": "",
  "mode": "quiz",
  "pages": [
    {
      "title": "Domande",
      "questions": [
        {
          "type": "multiple_choice",
          "title": "In che anno cadde l'Impero romano d'Occidente?",
          "required": true,
          "options": ["410", "476", "800"],
          "correctAnswer": "476",
          "score": 1
        },
        {
          "type": "short_answer",
          "title": "Chi fu il primo imperatore romano?",
          "required": true,
          "correctAnswer": "Augusto",
          "score": 2
        }
      ]
    }
  ]
}
\`\`\`
CHECK BEFORE REPLYING
1. One single json block, starting with { and without any \\" escape.
2. Only the allowed keys, nothing extra.
3. Every question has "type", "title", "required"; options only where the type allows them.
4. If "mode" is "quiz", every question with options has "correctAnswer" (copied from "options") and "score".`;

const GENERATE_HEAD = `You are helping a teacher build a Google Form. Create the form the teacher describes.
If essential information is missing (topic or number of questions) ask ONE short question first; otherwise reply directly in the format below.`;

const EXTRACT_HEAD = `You are helping a teacher turn an existing test, exam or worksheet into a Google Form.
The source is attached to this message (one or more PDF, Word or image files) or pasted at the end of it.
Extract the questions faithfully:
- Transcribe question texts and answer options LITERALLY, character by character, in the original order, across all attached files. Do not fix typos or punctuation, do not shorten, summarize, rephrase, translate, solve or improve anything, even if a text looks wrong or very long.
- Look for the correct answers everywhere: an answer key at the end or on a separate page, marked, ticked, underlined or highlighted options, handwritten solutions. If you find them for the questions, use mode "quiz" with "correctAnswer" and "score" (the points printed in the source, otherwise 1) for every question that has options. If the source has no answers at all, use mode "form" and NEVER guess answers.
- Map exercises to types: single choice -> multiple_choice; several correct options -> checkbox; true/false -> true_false; fill-in-the-blank or one-word answer -> short_answer; open question -> text; matching -> one dropdown question per item, with the elements to match as options.
- If a question depends on a picture, figure, table, graph or drawing, still include the question and describe what the picture shows in "imageHint" (for example "triangolo ABC con lati 3, 4, 5 cm"). Never invent an image URL.
- If a word or number is illegible, write [ILLEGGIBILE] in its place.`;

export function buildPrompt(mode: PromptMode): string {
  const head = mode === 'extract' ? EXTRACT_HEAD : GENERATE_HEAD;
  const tail =
    mode === 'extract'
      ? ''
      : "\n\nThe teacher's request follows below this line.\n";
  return `${head}\n\n${OUTPUT_SPEC}${tail}`;
}

const MAX_REPAIR_JSON = 20000;

export function buildRepairPrompt(problems: string[], rejectedJson?: string): string {
  const list = problems
    .slice(0, 10)
    .map((p) => `- ${p}`)
    .join('\n');
  const rejected = rejectedJson?.trim()
    ? `\n\nThis is the reply that was rejected:\n\`\`\`\n${rejectedJson.trim().slice(0, MAX_REPAIR_JSON)}\n\`\`\``
    : '';
  return `The JSON you produced was rejected by the importer. Problems found:\n${list}${rejected}\n\nFix them, keep the same questions word for word, use only the allowed keys, and reply again with exactly ONE fenced code block tagged json and nothing else (plain JSON object, no escaped quotes).`;
}
