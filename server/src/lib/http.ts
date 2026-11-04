import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';

export type FieldErrors = Record<string, string[]>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: FieldErrors,
  ) {
    super(message);
  }
}

/** Field-level messages only - the submitted values are never echoed back. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

export function validationError(error: z.ZodError): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', zodFieldErrors(error));
}

/** Express 4 does not catch rejected promises; forward them to the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
