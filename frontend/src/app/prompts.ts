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
          "imageHint": "string",
          "fidelity": "literal" | "interpreted" | "answer_inferred"
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
- "fidelity" (always write it) tells the teacher how much to trust the question:
  "literal" = text and options are copied unchanged from the source, or written by you from a clear request, and any correct answer is stated in the source;
  "interpreted" = you had to guess, reconstruct or reinterpret something (blurry or cut text, a doubtful reading, an ambiguous layout, a rephrasing);
  "answer_inferred" = the correct answer is NOT in the source and you chose it yourself (in a quiz this is the normal case for a scanned test without answers; use it also when you are unsure of the answer).
  If both "interpreted" and "answer_inferred" apply, write "interpreted". Be honest: when in doubt, do not write "literal".
- "imageHint" only when the question depends on a picture; otherwise leave it out.
- "description" may be an empty string.
RULES
- "mode" is "quiz" whenever the content is a test, quiz, exam, verification, assessment, exercise sheet ("verifica", "test", "quiz", "compito", "esame", "interrogazione") or the request or source mentions correct answers, grades, scores or an answer key. Use "form" ONLY for surveys, registrations, feedback or questionnaires where no answer is right or wrong. When unsure between the two, choose "quiz" and provide the correct answers. In "quiz" mode EVERY question that has options MUST have "correctAnswer" and "score".
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
          "score": 1,
          "fidelity": "literal"
        },
        {
          "type": "short_answer",
          "title": "Chi fu il primo imperatore romano?",
          "required": true,
          "correctAnswer": "Augusto",
          "score": 2,
          "fidelity": "answer_inferred"
        }
      ]
    }
  ]
}
\`\`\`
CHECK BEFORE REPLYING
1. One single json block, starting with { and without any \\" escape.
2. Only the allowed keys, nothing extra.
3. Every question has "type", "title", "required" and "fidelity"; options only where the type allows them.
4. If "mode" is "quiz", every question with options has "correctAnswer" (copied from "options") and "score".`;

const GENERATE_HEAD = `You are helping a teacher build a Google Form. Create the form the teacher describes.
If essential information is missing (topic or number of questions) ask ONE short question first; otherwise reply directly in the format below.
If the form is a test or quiz, YOU must work out the correct answer of every question yourself and fill in "correctAnswer" and "score" for each question that has options.`;

const EXTRACT_HEAD = `You are helping a teacher turn an existing test, exam or worksheet into a Google Form.
The source is attached to this message (one or more PDF, Word or image files) or pasted at the end of it.
Extract the questions faithfully:
- Transcribe question texts and answer options LITERALLY, character by character, in the original order, across all attached files. Do not fix typos or punctuation, do not shorten, summarize, rephrase, translate, solve or improve anything, even if a text looks wrong or very long.
- Look for the correct answers everywhere: an answer key at the end or on a separate page, marked, ticked, underlined or highlighted options, handwritten solutions. If the source shows them, use those and the points printed in the source.
- Most sources are scans of blank paper tests with NO answers marked. In that case do NOT use mode "form": use mode "quiz" and solve each question yourself, choosing the correct option and setting "correctAnswer" to it, with "score": 1 for every question (unless the source prints a different score). Do this for every question that has options; for short_answer you may add your best "correctAnswer" with "score": 1.
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
