export type PromptMode = 'generate' | 'extract';

const OUTPUT_SPEC = `OUTPUT FORMAT
Reply with exactly ONE fenced code block tagged json and nothing outside it: no greeting, no explanation.
Inside the block put valid, pretty-printed JSON (double quotes, no comments, no trailing commas). Do not wrap the JSON in a string and do not escape its quotes.
Use ONLY these keys, any other key is rejected:
{
  "title": "string",
  "description": "string (optional)",
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
RULES
- "mode" is "quiz" only when answers must be graded, otherwise "form".
- "options" is required for multiple_choice, checkbox, dropdown and true_false (for true_false write them in the form's language, e.g. ["Vero","Falso"]); omit it for the other types.
- "correctAnswer" and "score" only in quiz mode; "correctAnswer" must be exactly equal to one of the "options".
- "short_answer" is a one-line answer, "text" is a long paragraph.
- Use a single page unless the content has clearly separate sections.
- Write all texts in the language of the content (Italian if unsure). Plain text only: no Markdown, no LaTeX (write x², √, ½ with Unicode characters).`;

const GENERATE_HEAD = `You are helping a teacher build a Google Form. Create the form the teacher describes.
If essential information is missing (topic or number of questions) ask ONE short question first; otherwise reply directly in the format below.`;

const EXTRACT_HEAD = `You are helping a teacher turn an existing test, exam or worksheet into a Google Form.
The source is attached to this message (one or more PDF, Word or image files) or pasted at the end of it.
Extract the questions faithfully:
- Copy question texts and answer options exactly as written, in the original order, across all attached files. Do not invent, rephrase, solve or improve anything.
- If the source contains the correct answers (answer key, marked options) use mode "quiz" with "correctAnswer" and "score" (the points printed in the source, otherwise 1). If it does not, use mode "form" and NEVER guess answers.
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

export function buildRepairPrompt(problems: string[]): string {
  const list = problems
    .slice(0, 10)
    .map((p) => `- ${p}`)
    .join('\n');
  return `The JSON you produced was rejected by the importer. Problems found:\n${list}\n\nFix them, keep the same questions, and reply again with exactly ONE fenced code block tagged json and nothing else.`;
}
