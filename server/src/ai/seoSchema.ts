import { z } from 'zod';

const HTML_OR_ANGLE = /[<>]/;
const CONTROL = /[\u0000-\u001F\u007F]/;

const plainText = (label: string, min: number, max: number) =>
  z
    .string(`${label} must be text`)
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be ${max} characters or fewer`)
    .refine((v) => !HTML_OR_ANGLE.test(v), `${label} must be plain text (no HTML)`)
    .refine((v) => !CONTROL.test(v), `${label} contains invalid characters`);

/**
 * Contract for anything an LLM returns. Strict: unknown keys, HTML, wrong lengths or the wrong
 * number of FAQs all fail, and the suggestion is discarded rather than "repaired".
 */
export const seoSuggestionSchema = z.strictObject({
  seoTitle: plainText('SEO title', 10, 60),
  metaDescription: plainText('Meta description', 50, 160),
  faqs: z
    .array(
      z.strictObject({
        question: plainText('FAQ question', 5, 150),
        answer: plainText('FAQ answer', 10, 500),
      }),
    )
    .min(2, 'Provide 2-3 FAQs')
    .max(3, 'Provide 2-3 FAQs'),
});
export type SeoSuggestion = z.infer<typeof seoSuggestionSchema>;

/** What an admin sends to request a draft (fictional page title + description only). */
export const seoRequestSchema = z.object({
  pageRef: z.string().trim().min(1).max(100),
  pageTitle: plainText('Page title', 3, 120),
  description: plainText('Description', 20, 2000),
});
