import { z } from 'zod';
import { BRAND_IDS } from '../config/brands';
import { ENQUIRY_STATUSES } from '../db/enquiries';

// Control characters (excluding tab/newline/carriage return for multi-line text).
const SINGLE_LINE_BAD = /[\u0000-\u001F\u007F]/;
const MULTI_LINE_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const todayMinusOneUtc = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const twoYearsAheadUtc = () => new Date(Date.now() + 2 * 365 * 86_400_000).toISOString().slice(0, 10);

/**
 * Public enquiry submission. Note there is no `brand` field: unknown keys (including any
 * attacker-supplied "brand") are stripped, and the brand comes from the verified form token.
 * HTML is not rejected - it is stored as plain text and escaped on output (React / JSON).
 */
export const submitEnquirySchema = z.object({
  fullName: z
    .string('Full name is required')
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be 100 characters or fewer')
    .refine((v) => !SINGLE_LINE_BAD.test(v), 'Full name contains invalid characters'),
  email: z
    .string('Email is required')
    .trim()
    .toLowerCase()
    .max(254, 'Email is too long')
    .pipe(z.email({ error: 'Enter a valid email address' })),
  enquiryType: z.string('Choose an enquiry type').trim().min(1, 'Choose an enquiry type').max(50),
  message: z
    .string('Message is required')
    .trim()
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message must be 2000 characters or fewer')
    .refine((v) => !MULTI_LINE_BAD.test(v), 'Message contains invalid characters'),
  preferredDate: z
    .union([z.literal(''), z.iso.date({ error: 'Use a valid date (YYYY-MM-DD)' })])
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine(
      (v) => v === undefined || (v >= todayMinusOneUtc() && v <= twoYearsAheadUtc()),
      'Preferred date must be today or later, within two years',
    ),
});
export type SubmitEnquiryInput = z.infer<typeof submitEnquirySchema>;

export const listEnquiriesQuerySchema = z.object({
  brand: z.enum(BRAND_IDS).optional(),
  status: z.enum(ENQUIRY_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const updateStatusSchema = z.object({ status: z.enum(ENQUIRY_STATUSES) });
