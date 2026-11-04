import type { LlmProvider, SeoGenerationInput } from './provider';

/** Shortens at a word boundary and adds an ellipsis so the result fits `max` characters. */
function fit(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:-]+$/, '')}…`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

/**
 * Deterministic offline provider (the default). It only rearranges the text it is given, so it
 * cannot introduce new facts - which makes the approval flow easy to demonstrate and test.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  async generateSeo({ brandName, pageTitle, description }: SeoGenerationInput, opts: { signal: AbortSignal }) {
    await sleep(150, opts.signal); // simulate network latency

    const fullTitle = `${pageTitle} | ${brandName}`;
    const seoTitle = fullTitle.length <= 60 ? fullTitle : fit(pageTitle, 60);

    let meta = description;
    if (meta.length < 60) meta = `${meta} Enquire with ${brandName} to find out more.`;
    const metaDescription = fit(meta, 155);

    const firstSentence = description.split(/(?<=[.!?])\s+/)[0] ?? description;

    return {
      seoTitle,
      metaDescription,
      faqs: [
        { question: `What is ${pageTitle}?`, answer: fit(firstSentence, 300) },
        {
          question: `How do I enquire about ${pageTitle}?`,
          answer: `Use the enquiry form on this page and the ${brandName} team will reply with the details.`,
        },
        {
          question: 'Can I ask a question before booking?',
          answer: `Yes. Send your question through the enquiry form and a member of the ${brandName} team will get back to you.`,
        },
      ],
    };
  }
}
