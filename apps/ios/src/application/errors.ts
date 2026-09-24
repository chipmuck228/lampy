export class ApplicationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

export function toApplicationError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: string }).code || 'APPLICATION_FAILED');
    const message = error instanceof Error ? error.message : 'application failed';
    return new ApplicationError(code, message);
  }
  if (error instanceof Error) {
    return new ApplicationError('APPLICATION_FAILED', error.message);
  }
  return new ApplicationError('APPLICATION_FAILED', 'application failed');
}
