import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { flagUnverifiedClaims } from '../ai/claims';
import { seoRequestSchema, seoSuggestionSchema } from '../ai/seoSchema';
import { AiError, generateSeoSuggestion } from '../ai/service';
import { BRANDS } from '../config/brands';
import { DEMO_PAGES, getDemoPage } from '../config/pages';
import {
  approveDraft,
  createDraft,
  getDraft,
  getPublishedSeo,
  listDrafts,
  publishDraft,
  rejectDraft,
  type TransitionResult,
} from '../db/seo';
import { asyncHandler, HttpError, validationError } from '../lib/http';
import { idParamSchema } from '../validation/enquiry';

const approveSchema = z.object({ output: seoSuggestionSchema.optional() });
const listQuerySchema = z.object({ pageRef: z.string().max(100).optional() });

function sendTransition(res: import('express').Response, result: TransitionResult): void {
  if (result.ok) {
    res.json({ draft: result.draft });
    return;
  }
  if (result.reason === 'not_found') throw new HttpError(404, 'NOT_FOUND', 'Draft not found.');
  throw new HttpError(409, 'INVALID_STATE', `This draft is "${result.state}" and cannot be changed this way.`);
}

/** Mounted behind requireRole('admin') and csrfProtect in app.ts. */
export function aiRouter({ config, db, llm }: AppDeps): Router {
  const router = Router();

  router.get('/pages', asyncHandler(async (_req, res) => {
    res.json({
      provider: llm.name,
      pages: await Promise.all(
        Object.values(DEMO_PAGES).map(async (p) => ({
          ...p,
          brandName: BRANDS[p.brand].name,
          published: (await getPublishedSeo(db, p.pageRef)) ?? null,
        })),
      ),
    });
  }));

  router.post(
    '/seo-drafts',
    asyncHandler(async (req, res) => {
      const parsed = seoRequestSchema.safeParse(req.body);
      if (!parsed.success) throw validationError(parsed.error);
      const page = getDemoPage(parsed.data.pageRef);
      if (!page) throw new HttpError(400, 'VALIDATION_ERROR', 'Unknown page.', { pageRef: ['Choose one of the demo pages'] });

      let result;
      try {
        result = await generateSeoSuggestion(
          llm,
          { brandName: BRANDS[page.brand].name, pageTitle: parsed.data.pageTitle, description: parsed.data.description },
          config.ai.timeoutMs,
        );
      } catch (err) {
        if (err instanceof AiError) throw new HttpError(502, err.code, err.message);
        throw err;
      }

      const id = await createDraft(db, {
        pageRef: page.pageRef,
        brand: page.brand,
        input: result.input,
        output: result.suggestion,
        warnings: result.warnings,
        provider: llm.name,
        userId: req.user!.id,
      });
      res.status(201).json({ draft: await getDraft(db, id), redactions: result.redactions });
    }),
  );

  router.get('/seo-drafts', asyncHandler(async (req, res) => {
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) throw validationError(q.error);
    res.json({ drafts: await listDrafts(db, q.data.pageRef) });
  }));

  /** Human approval. The reviewer may edit the text; edits go through the same validation. */
  router.post('/seo-drafts/:id/approve', asyncHandler(async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) throw validationError(params.error);
    const body = approveSchema.safeParse(req.body ?? {});
    if (!body.success) throw validationError(body.error);

    let edited;
    if (body.data.output) {
      const draft = await getDraft(db, params.data.id);
      const source = draft ? `${draft.input.brandName}\n${draft.input.pageTitle}\n${draft.input.description}` : '';
      edited = { output: body.data.output, warnings: flagUnverifiedClaims(source, body.data.output) };
    }
    sendTransition(res, await approveDraft(db, params.data.id, req.user!.id, edited));
  }));

  router.post('/seo-drafts/:id/reject', asyncHandler(async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) throw validationError(params.error);
    sendTransition(res, await rejectDraft(db, params.data.id, req.user!.id));
  }));

  router.post('/seo-drafts/:id/publish', asyncHandler(async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) throw validationError(params.error);
    sendTransition(res, await publishDraft(db, params.data.id, req.user!.id));
  }));

  return router;
}
