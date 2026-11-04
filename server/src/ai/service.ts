import { flagUnverifiedClaims } from './claims';
import type { LlmProvider, SeoGenerationInput } from './provider';
import { redactPersonalData } from './redact';
import { seoSuggestionSchema, type SeoSuggestion } from './seoSchema';

export type AiErrorCode = 'AI_TIMEOUT' | 'AI_UNAVAILABLE' | 'AI_INVALID_OUTPUT';

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface SeoGenerationResult {
  input: SeoGenerationInput;
  suggestion: SeoSuggestion;
  warnings: string[];
  redactions: number;
}

/**
 * Redact -> call provider with a hard timeout -> validate -> flag unverified claims.
 * Any failure throws an AiError; nothing partially valid is ever returned or stored.
 */
export async function generateSeoSuggestion(
  llm: LlmProvider,
  page: SeoGenerationInput,
  timeoutMs: number,
): Promise<SeoGenerationResult> {
  const title = redactPersonalData(page.pageTitle);
  const desc = redactPersonalData(page.description);
  const input: SeoGenerationInput = { brandName: page.brandName, pageTitle: title.text, description: desc.text };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Also covers providers that ignore the abort signal.
  const timeout = new Promise<never>((_, reject) =>
    controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }),
  );

  let raw: unknown;
  try {
    raw = await Promise.race([llm.generateSeo(input, { signal: controller.signal }), timeout]);
  } catch (err) {
    if (controller.signal.aborted) throw new AiError('AI_TIMEOUT', 'The AI provider did not respond in time.');
    console.error(`[ai] provider "${llm.name}" failed: ${(err as Error)?.message ?? 'unknown error'}`);
    throw new AiError('AI_UNAVAILABLE', 'The AI provider is unavailable. Please try again later.');
  } finally {
    clearTimeout(timer);
  }

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new AiError('AI_INVALID_OUTPUT', 'The AI response was not valid JSON and was discarded.');
    }
  }

  const parsed = seoSuggestionSchema.safeParse(raw);
  if (!parsed.success) {
    // Log only which fields failed - never the content itself.
    console.warn(`[ai] invalid output from "${llm.name}": ${parsed.error.issues.map((i) => i.path.join('.') || '_').join(', ')}`);
    throw new AiError('AI_INVALID_OUTPUT', 'The AI response did not match the required format and was discarded.');
  }

  const source = `${input.brandName}\n${input.pageTitle}\n${input.description}`;
  return {
    input,
    suggestion: parsed.data,
    warnings: flagUnverifiedClaims(source, parsed.data),
    redactions: title.redactions + desc.redactions,
  };
}
