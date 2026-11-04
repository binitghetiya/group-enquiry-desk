import type { SeoSuggestion } from './seoSchema';

// Marketing/medical/legal claims that must be backed by the source text before publishing.
const RISKY_TERMS = [
  'best',
  '#1',
  'number one',
  'guarantee',
  'guaranteed',
  'cure',
  'cures',
  'certified',
  'accredited',
  'award-winning',
  'cheapest',
  'free',
  '24/7',
  'leading',
  'official',
  'pain-free',
  'risk-free',
  'aed',
  '$',
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function containsTerm(haystack: string, term: string): boolean {
  if (/^[a-z]/.test(term)) return new RegExp(`\\b${escapeRe(term)}\\b`, 'i').test(haystack);
  return haystack.toLowerCase().includes(term);
}

/**
 * Flags numbers and claim words in the suggestion that do not appear in the source text. These
 * are warnings for the human reviewer, shown next to the Approve button - not an automatic filter.
 */
export function flagUnverifiedClaims(source: string, suggestion: SeoSuggestion): string[] {
  const output = [
    suggestion.seoTitle,
    suggestion.metaDescription,
    ...suggestion.faqs.flatMap((f) => [f.question, f.answer]),
  ].join('\n');
  const warnings = new Set<string>();

  for (const num of output.match(/\d+(?:[.,:]\d+)*%?/g) ?? []) {
    if (!source.includes(num)) warnings.add(`"${num}" does not appear in the source text - verify before approving.`);
  }
  for (const term of RISKY_TERMS) {
    if (containsTerm(output, term) && !containsTerm(source, term)) {
      warnings.add(`Claim "${term}" is not supported by the source text - verify or remove.`);
    }
  }
  return [...warnings];
}
