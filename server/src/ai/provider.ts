import type { AppConfig } from '../config/env';
import { HttpLlmProvider } from './httpProvider';
import { MockLlmProvider } from './mockProvider';

/** Already redacted, page-level text only. Never contains enquiry records. */
export interface SeoGenerationInput {
  brandName: string;
  pageTitle: string;
  description: string;
}

/**
 * The seam where a real LLM connects. Implementations return `unknown` on purpose: whatever comes
 * back is untrusted and must pass seoSuggestionSchema before anyone sees it.
 */
export interface LlmProvider {
  readonly name: string;
  generateSeo(input: SeoGenerationInput, opts: { signal: AbortSignal }): Promise<unknown>;
}

export function createProvider(ai: AppConfig['ai']): LlmProvider {
  if (ai.provider === 'http') {
    if (!ai.apiUrl || !ai.apiKey) {
      throw new Error('AI_PROVIDER=http requires AI_API_URL and AI_API_KEY (server-side environment only).');
    }
    return new HttpLlmProvider(ai.apiUrl, ai.apiKey);
  }
  return new MockLlmProvider();
}
