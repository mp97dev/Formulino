import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(res: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({}) }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = makeHost({ status, json });
  });

  it('passes through NestJS HttpException status and body unchanged', () => {
    filter.catch(new BadRequestException('bad input'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'bad input' }),
    );
  });

  it('maps a Google API error shape to 502 with the Google message, without leaking request config', () => {
    const googleError = {
      message: 'Request failed',
      status: 400,
      config: { headers: { Authorization: 'Bearer secret-token' } },
      response: {
        data: {
          error: {
            code: 400,
            status: 'INVALID_ARGUMENT',
            message:
              'Invalid requests[3]: Invalid grading, All correct answers must be valid options for questions with options.',
          },
        },
      },
    };

    filter.catch(googleError, host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      statusCode: 502,
      error: 'Bad Gateway',
      message:
        'Google API error: Invalid requests[3]: Invalid grading, All correct answers must be valid options for questions with options.',
    });
  });

  it('maps an unknown error to a generic 500 without leaking internals', () => {
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Unexpected server error',
    });
  });
});
