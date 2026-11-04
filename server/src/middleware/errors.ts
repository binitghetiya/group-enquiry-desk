import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../lib/http';

export const requestId: RequestHandler = (_req, res, next) => {
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId as string);
  next();
};

export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
};

/**
 * Central error handler. Clients get a stable code and a generic message; stack traces and
 * request bodies are never returned or logged (bodies can contain personal data).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
    });
    return;
  }

  // body-parser errors (malformed JSON, oversized body)
  const type = (err as { type?: string }).type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body must be valid JSON.' } });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
    return;
  }

  console.error(`[error] ${requestId} ${req.method} ${req.path}: ${(err as Error)?.message ?? 'unknown'}`);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong. Please try again later.', requestId },
  });
};
