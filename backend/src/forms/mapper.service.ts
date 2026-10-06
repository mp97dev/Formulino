import type { Form, Question } from './dsl-types';

export interface GoogleFormsRequest {
  createItem?: {
    item: {
      title: string;
      description?: string;
      itemId?: string;
      questionItem?: {
        question: {
          required: boolean;
          choiceQuestion?: {
            type: 'RADIO' | 'CHECKBOX' | 'DROP_DOWN';
            options: { value: string }[];
            shuffle: boolean;
          };
          textQuestion?: { paragraph: boolean };
          scaleQuestion?: undefined;
          grading?: {
            pointValue: number;
            correctAnswers: { answers: { value: string }[] };
          };
        };
      };
      pageBreakItem?: Record<string, never>;
      imageItem?: { image: { sourceUri: string } };
      videoItem?: { video: { youtubeUri: string } };
    };
    location: { index: number };
  };
}

function buildChoiceType(type: Question['type']): 'RADIO' | 'CHECKBOX' | 'DROP_DOWN' | null {
  switch (type) {
    case 'multiple_choice':
      return 'RADIO';
    case 'true_false':
      return 'RADIO';
    case 'checkbox':
      return 'CHECKBOX';
    case 'dropdown':
      return 'DROP_DOWN';
    default:
      return null;
  }
}

function mapQuestion(
  question: Question,
  index: number,
  isQuizMode: boolean,
): GoogleFormsRequest {
  const choiceType = buildChoiceType(question.type);

  if (choiceType) {
    const options =
      question.options && question.options.length > 0
        ? question.options
        : question.type === 'true_false'
          ? ['True', 'False']
          : [];

    const mappedOptions = options.map((opt) => ({ value: opt }));

    const grading =
      isQuizMode && question.correctAnswer
        ? {
            pointValue: question.score ?? 1,
            correctAnswers: { answers: [{ value: question.correctAnswer }] },
          }
        : undefined;

    return {
      createItem: {
        item: {
          title: question.title,
          questionItem: {
            question: {
              required: question.required,
              choiceQuestion: {
                type: choiceType,
                options: mappedOptions,
                shuffle: question.shuffle === true,
              },
              ...(grading ? { grading } : {}),
            },
          },
        },
        location: { index },
      },
    };
  }

  // text / short_answer
  return {
    createItem: {
      item: {
        title: question.title,
        questionItem: {
          question: {
            required: question.required,
            textQuestion: {
              paragraph: question.type === 'text',
            },
          },
        },
      },
      location: { index },
    },
  };
}

export function mapDslToGoogleRequests(form: Form): GoogleFormsRequest[] {
  const isQuizMode = form.mode === 'quiz';
  const requests: GoogleFormsRequest[] = [];
  let itemIndex = 0;

  for (let pageIdx = 0; pageIdx < form.pages.length; pageIdx++) {
    const page = form.pages[pageIdx];

    // Add page break before each page except the first
    if (pageIdx > 0) {
      requests.push({
        createItem: {
          item: {
            title: page.title,
            pageBreakItem: {},
          },
          location: { index: itemIndex },
        },
      });
      itemIndex++;
    }

    for (const question of page.questions) {
      const questionRequest = mapQuestion(question, itemIndex, isQuizMode);
      // The Forms API cannot upload images, so when the source needed a figure
      // we leave a visible marker the teacher can search for and replace.
      if (question.metadata?.imageHint && !question.media && questionRequest.createItem) {
        questionRequest.createItem.item.description = `[📷 Figura da inserire: ${question.metadata.imageHint}]`;
      }
      requests.push(questionRequest);
      itemIndex++;

      if (question.media) {
        const { type, url } = question.media;
        if (type === 'image') {
          requests.push({
            createItem: {
              item: { title: '', imageItem: { image: { sourceUri: url } } },
              location: { index: itemIndex },
            },
          });
        } else if (type === 'video') {
          requests.push({
            createItem: {
              item: { title: '', videoItem: { video: { youtubeUri: url } } },
              location: { index: itemIndex },
            },
          });
        }
        itemIndex++;
      }
    }
  }

  return requests;
}
