import { Router } from 'express';
import type { AppDeps } from '../app';
import { BRAND_IDS, BRANDS } from '../config/brands';
import { ENQUIRY_STATUSES, listEnquiries, updateEnquiryStatus } from '../db/enquiries';
import { asyncHandler, HttpError, validationError } from '../lib/http';
import { idParamSchema, listEnquiriesQuerySchema, updateStatusSchema } from '../validation/enquiry';

/** Mounted behind requireRole('staff') and csrfProtect in app.ts. */
export function enquiriesRouter({ db }: AppDeps): Router {
  const router = Router();

  router.get('/meta', (_req, res) => {
    res.json({
      brands: BRAND_IDS.map((id) => ({ id, name: BRANDS[id].name, enquiryTypes: BRANDS[id].enquiryTypes })),
      statuses: ENQUIRY_STATUSES,
    });
  });

  router.get('/', asyncHandler(async (req, res) => {
    const parsed = listEnquiriesQuerySchema.safeParse(req.query);
    if (!parsed.success) throw validationError(parsed.error);
    const { items, total } = await listEnquiries(db, parsed.data);
    res.json({ items, total, page: parsed.data.page, limit: parsed.data.limit });
  }));

  router.patch('/:id/status', asyncHandler(async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) throw validationError(params.error);
    const body = updateStatusSchema.safeParse(req.body);
    if (!body.success) throw validationError(body.error);

    const updated = await updateEnquiryStatus(db, params.data.id, body.data.status, req.user!.id);
    if (!updated) throw new HttpError(404, 'NOT_FOUND', 'Enquiry not found.');
    res.json({ item: updated });
  }));

  return router;
}
