import { Router } from 'express';
import type { AppDeps } from '../app';
import { BRANDS, brandForSiteKey, isEnquiryTypeFor } from '../config/brands';
import { getDemoPage } from '../config/pages';
import { insertEnquiry } from '../db/enquiries';
import { getPublishedSeo } from '../db/seo';
import { signFormToken, verifyFormToken } from '../lib/formToken';
import { asyncHandler, HttpError, validationError } from '../lib/http';
import { hashIp } from '../lib/ipHash';
import { makeLimiter } from '../middleware/rateLimit';
import { submitEnquirySchema } from '../validation/enquiry';

export function publicRouter({ config, db }: AppDeps): Router {
  const router = Router();
  const readLimiter = makeLimiter(db, config.publicReadLimit, config.ipHashSecret, 'public-read');
  const submitLimiter = makeLimiter(db, config.publicSubmitLimit, config.ipHashSecret, 'public-submit');

  /** Form configuration for a page. The brand comes from server config, never from the client. */
  router.get('/form-config/:siteKey', readLimiter, (req, res) => {
    const brand = brandForSiteKey(req.params.siteKey ?? '');
    if (!brand) throw new HttpError(404, 'NOT_FOUND', 'This enquiry form is not available.');
    res.json({
      brand: { name: brand.name, notice: brand.notice ?? null },
      enquiryTypes: brand.enquiryTypes,
      formToken: signFormToken(config.formTokenSecret, brand.id),
    });
  });

  /** Public submission. Write-only: there is no public endpoint that returns enquiries. */
  router.post('/enquiries', submitLimiter, asyncHandler(async (req, res) => {
    const body: Record<string, unknown> =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

    // Honeypot: real users never see the "website" field. Pretend success, store nothing.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      res.status(201).json({ ok: true });
      return;
    }

    const token = verifyFormToken(config.formTokenSecret, body.formToken, {
      minFillMs: config.formMinFillMs,
      ttlMs: config.formTokenTtlMs,
    });
    if (!token.ok) {
      if (token.reason === 'too_fast') {
        throw new HttpError(400, 'TOO_FAST', 'Please take a moment to review your enquiry, then submit again.');
      }
      throw new HttpError(403, 'FORM_INVALID', 'This form has expired. Please reload the page and try again.');
    }

    const parsed = submitEnquirySchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error);
    const input = parsed.data;

    if (!isEnquiryTypeFor(token.brand, input.enquiryType)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', {
        enquiryType: [`Choose an enquiry type offered by ${BRANDS[token.brand].name}`],
      });
    }

    const id = await insertEnquiry(db, {
        brand: token.brand,
        fullName: input.fullName,
        email: input.email,
        enquiryType: input.enquiryType,
        message: input.message,
        preferredDate: input.preferredDate,
        ipHash: hashIp(config.ipHashSecret, req.ip),
        formNonce: token.nonce,
    });
    if (id === undefined) {
      throw new HttpError(409, 'ALREADY_SUBMITTED', 'This form was already submitted. Reload the page to send another enquiry.');
    }

    res.status(201).json({ ok: true });
  }));

  /** Published (human-approved) SEO for a demo page. Drafts are never exposed here. */
  router.get('/pages/:pageRef', readLimiter, asyncHandler(async (req, res) => {
    const page = getDemoPage(req.params.pageRef ?? '');
    if (!page) throw new HttpError(404, 'NOT_FOUND', 'Page not found.');
    res.json({
      pageRef: page.pageRef,
      brand: BRANDS[page.brand].name,
      title: page.title,
      description: page.description,
      seo: (await getPublishedSeo(db, page.pageRef)) ?? null,
    });
  }));

  return router;
}
