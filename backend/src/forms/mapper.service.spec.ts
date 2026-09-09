import { mapDslToGoogleRequests } from './mapper.service';
import type { Form } from './dsl-types';

const baseForm: Form = {
  id: 'f1',
  title: 'Test Form',
  description: 'desc',
  mode: 'form',
  settings: { collectEmails: false, limitOneResponse: false, shuffleQuestions: false },
  pages: [
    {
      id: 'p1',
      title: 'Page 1',
      questions: [
        { id: 'q1', type: 'short_answer', title: 'Name?', required: true },
        {
          id: 'q2',
          type: 'multiple_choice',
          title: 'Color?',
          required: false,
          options: ['Red', 'Blue'],
        },
      ],
    },
  ],
};

describe('mapDslToGoogleRequests', () => {
  it('maps a single-page form to ordered items without page break', () => {
    const requests = mapDslToGoogleRequests(baseForm);
    expect(requests).toHaveLength(2);
    expect(requests[0].createItem?.location.index).toBe(0);
    expect(requests[1].createItem?.location.index).toBe(1);
  });

  it('inserts page break between pages', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        ...baseForm.pages,
        {
          id: 'p2',
          title: 'Page 2',
          questions: [{ id: 'q3', type: 'text', title: 'Comments?', required: false }],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    // p1: 2 questions, page break, p2: 1 question = 4 items
    expect(requests).toHaveLength(4);
    expect(requests[2].createItem?.item.pageBreakItem).toBeDefined();
  });

  it('maps multiple_choice to RADIO', () => {
    const requests = mapDslToGoogleRequests(baseForm);
    const choiceReq = requests[1];
    expect(choiceReq.createItem?.item.questionItem?.question.choiceQuestion?.type).toBe('RADIO');
  });

  it('maps true_false to RADIO with True/False options', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [{ id: 'q1', type: 'true_false', title: 'Is this true?', required: true }],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    const opts = requests[0].createItem?.item.questionItem?.question.choiceQuestion?.options ?? [];
    expect(opts.map((o) => o.value)).toEqual(['True', 'False']);
  });

  it('uses localized options for true_false when provided instead of defaulting to English', () => {
    const form: Form = {
      ...baseForm,
      mode: 'quiz',
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'true_false',
              title: 'Una pianta è un essere vivente.',
              required: true,
              options: ['Vero', 'Falso'],
              correctAnswer: 'Vero',
              score: 1,
            },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    const question = requests[0].createItem?.item.questionItem?.question;
    const opts = question?.choiceQuestion?.options ?? [];
    expect(opts.map((o) => o.value)).toEqual(['Vero', 'Falso']);
    expect(question?.grading?.correctAnswers.answers).toEqual([{ value: 'Vero' }]);
  });

  it('adds grading info in quiz mode', () => {
    const form: Form = {
      ...baseForm,
      mode: 'quiz',
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'multiple_choice',
              title: 'Capital?',
              required: true,
              options: ['Rome', 'Paris'],
              correctAnswer: 'Rome',
              score: 3,
            },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    const grading = requests[0].createItem?.item.questionItem?.question.grading;
    expect(grading?.pointValue).toBe(3);
    expect(grading?.correctAnswers.answers[0].value).toBe('Rome');
  });

  it('does not include isCorrect in quiz mode options', () => {
    const form: Form = {
      ...baseForm,
      mode: 'quiz',
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'multiple_choice',
              title: 'Capital?',
              required: true,
              options: ['Rome', 'Paris'],
              correctAnswer: 'Rome',
            },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    const opts = requests[0].createItem?.item.questionItem?.question.choiceQuestion?.options ?? [];
    opts.forEach((opt) => {
      expect(opt).not.toHaveProperty('isCorrect');
    });
  });

  it('maps text question to paragraph:true', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [{ id: 'q1', type: 'text', title: 'Comments?', required: false }],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    expect(requests[0].createItem?.item.questionItem?.question.textQuestion?.paragraph).toBe(true);
  });

  it('maps short_answer to paragraph:false', () => {
    const requests = mapDslToGoogleRequests(baseForm);
    expect(requests[0].createItem?.item.questionItem?.question.textQuestion?.paragraph).toBe(false);
  });

  it('emits imageItem after a question with image media', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'short_answer',
              title: 'Name?',
              required: true,
              media: { type: 'image', url: 'https://example.com/img.png' },
            },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    expect(requests).toHaveLength(2);
    expect(requests[0].createItem?.item.questionItem).toBeDefined();
    expect(requests[1].createItem?.item.imageItem?.image.sourceUri).toBe(
      'https://example.com/img.png',
    );
    expect(requests[1].createItem?.location.index).toBe(1);
  });

  it('emits videoItem after a question with video media', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'short_answer',
              title: 'Fav video?',
              required: false,
              media: { type: 'video', url: 'https://www.youtube.com/watch?v=abc' },
            },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    expect(requests).toHaveLength(2);
    expect(requests[1].createItem?.item.videoItem?.video.youtubeUri).toBe(
      'https://www.youtube.com/watch?v=abc',
    );
  });

  it('does not set itemId on any createItem (Google API rejects non-numeric IDs)', () => {
    const requests = mapDslToGoogleRequests(baseForm);
    requests.forEach((req) => {
      expect(req.createItem?.item).not.toHaveProperty('itemId');
    });
  });

  it('does not set itemId on quiz or multi-page forms', () => {
    const quizForm: Form = {
      ...baseForm,
      mode: 'quiz',
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'multiple_choice',
              title: 'Capital?',
              required: true,
              options: ['Rome', 'Paris'],
              correctAnswer: 'Rome',
              score: 2,
            },
          ],
        },
        {
          id: 'p2',
          title: 'Page 2',
          questions: [{ id: 'q2', type: 'short_answer', title: 'Open?', required: false }],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(quizForm);
    // 3 items: q1, pageBreak before p2, q2
    expect(requests).toHaveLength(3);
    requests.forEach((req) => {
      expect(req.createItem?.item).not.toHaveProperty('itemId');
    });
  });

  it('quiz with multiple pages: all questions have grading, page breaks separate pages', () => {
    const form: Form = {
      ...baseForm,
      mode: 'quiz',
      pages: [
        {
          id: 'p1',
          title: 'Chapter 1',
          questions: [
            { id: 'q1', type: 'multiple_choice', title: 'Q1?', required: true, options: ['A', 'B'], correctAnswer: 'A', score: 3 },
          ],
        },
        {
          id: 'p2',
          title: 'Chapter 2',
          questions: [
            { id: 'q2', type: 'multiple_choice', title: 'Q2?', required: true, options: ['X', 'Y'], correctAnswer: 'X', score: 5 },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    // q1, pageBreak, q2 = 3 items
    expect(requests).toHaveLength(3);
    expect(requests[0].createItem?.item.questionItem?.question.grading?.pointValue).toBe(3);
    expect(requests[1].createItem?.item.pageBreakItem).toBeDefined();
    expect(requests[1].createItem?.item.title).toBe('Chapter 2');
    expect(requests[2].createItem?.item.questionItem?.question.grading?.pointValue).toBe(5);
    // Indices must be sequential
    expect(requests[0].createItem?.location.index).toBe(0);
    expect(requests[1].createItem?.location.index).toBe(1);
    expect(requests[2].createItem?.location.index).toBe(2);
  });

  it('image media is emitted after the question at the correct index', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'multiple_choice',
              title: 'Look at the image and answer:',
              required: true,
              options: ['Cat', 'Dog'],
              media: { type: 'image', url: 'https://example.com/animal.jpg' },
            },
            { id: 'q2', type: 'short_answer', title: 'Name?', required: false },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    // q1, imageItem, q2 = 3 items
    expect(requests).toHaveLength(3);
    expect(requests[0].createItem?.item.questionItem).toBeDefined();
    expect(requests[0].createItem?.location.index).toBe(0);
    expect(requests[1].createItem?.item.imageItem?.image.sourceUri).toBe('https://example.com/animal.jpg');
    expect(requests[1].createItem?.location.index).toBe(1);
    expect(requests[2].createItem?.item.questionItem).toBeDefined();
    expect(requests[2].createItem?.location.index).toBe(2);
  });

  it('quiz with image: grading and image both present, no itemId', () => {
    const form: Form = {
      ...baseForm,
      mode: 'quiz',
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'multiple_choice',
              title: 'What animal is this?',
              required: true,
              options: ['Lion', 'Tiger'],
              correctAnswer: 'Lion',
              score: 2,
              media: { type: 'image', url: 'https://example.com/lion.jpg' },
            },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    expect(requests).toHaveLength(2);
    expect(requests[0].createItem?.item.questionItem?.question.grading?.pointValue).toBe(2);
    expect(requests[1].createItem?.item.imageItem?.image.sourceUri).toBe('https://example.com/lion.jpg');
    requests.forEach((r) => {
      expect(r.createItem?.item).not.toHaveProperty('itemId');
    });
  });

  it('non-quiz form does not include grading even when correctAnswer is present', () => {
    const form: Form = {
      ...baseForm,
      mode: 'form',
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            { id: 'q1', type: 'multiple_choice', title: 'Pick one?', required: true, options: ['A', 'B'], correctAnswer: 'A', score: 10 },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    expect(requests[0].createItem?.item.questionItem?.question.grading).toBeUndefined();
  });

  it('dropdown question maps to DROP_DOWN type', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [{ id: 'q1', type: 'dropdown', title: 'Choose?', required: false, options: ['X', 'Y', 'Z'] }],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    expect(requests[0].createItem?.item.questionItem?.question.choiceQuestion?.type).toBe('DROP_DOWN');
  });

  it('checkbox question maps to CHECKBOX type', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [{ id: 'q1', type: 'checkbox', title: 'Select all?', required: false, options: ['A', 'B', 'C'] }],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    expect(requests[0].createItem?.item.questionItem?.question.choiceQuestion?.type).toBe('CHECKBOX');
  });

  it('score defaults to 1 when not specified in quiz mode', () => {
    const form: Form = {
      ...baseForm,
      mode: 'quiz',
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            { id: 'q1', type: 'multiple_choice', title: 'Q?', required: true, options: ['A', 'B'], correctAnswer: 'A' },
          ],
        },
      ],
    };
    const requests = mapDslToGoogleRequests(form);
    expect(requests[0].createItem?.item.questionItem?.question.grading?.pointValue).toBe(1);
  });
});
