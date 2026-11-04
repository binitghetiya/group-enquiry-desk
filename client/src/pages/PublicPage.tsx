import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type PublishedSeo } from '../api';

interface PageData {
  pageRef: string;
  brand: string;
  title: string;
  description: string;
  seo: PublishedSeo | null;
}

function setMetaDescription(content: string) {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = 'description';
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content); // attribute value, not HTML - safe
}

/** Shows only human-approved, published SEO. Drafts never reach this page. */
export function PublicPage() {
  const { pageRef = '' } = useParams();
  const [page, setPage] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PageData>(`/api/public/pages/${encodeURIComponent(pageRef)}`)
      .then(setPage)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load page.'));
  }, [pageRef]);

  useEffect(() => {
    if (!page) return;
    document.title = page.seo?.seoTitle ?? `${page.title} | ${page.brand}`;
    setMetaDescription(page.seo?.metaDescription ?? page.description.slice(0, 155));
  }, [page]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!page) return <p className="muted">Loading…</p>;

  const faqJsonLd = page.seo && {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.seo.faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  return (
    <article className="panel">
      <p className="muted">{page.brand} · fictional demo page</p>
      <h1>{page.title}</h1>
      <p>{page.description}</p>

      {page.seo ? (
        <>
          <h2>Frequently asked questions</h2>
          <dl className="faq">
            {page.seo.faqs.map((f) => (
              <div key={f.question}>
                <dt>{f.question}</dt>
                <dd>{f.answer}</dd>
              </div>
            ))}
          </dl>
          <details>
            <summary>SEO metadata in use (published {new Date(page.seo.publishedAt).toLocaleString()})</summary>
            <p>
              <strong>Title:</strong> {page.seo.seoTitle}
            </p>
            <p>
              <strong>Meta description:</strong> {page.seo.metaDescription}
            </p>
            <p className="hint">FAQPage JSON-LD that a server-rendered page would emit in &lt;head&gt;:</p>
            <pre className="code">{JSON.stringify(faqJsonLd, null, 2)}</pre>
          </details>
        </>
      ) : (
        <p className="alert alert-info">No SEO metadata has been approved and published for this page yet.</p>
      )}
    </article>
  );
}
