import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type PublishedSeo } from '../api';
import { Alert, EmptyState, Icon, LoadingState } from '../components/ui';

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

  if (error) {
    return (
      <div className="panel article">
        <EmptyState icon="file" title="This page is not available" action={<Link to="/" className="btn btn-secondary">Back to home</Link>}>
          <p role="alert">{error}</p>
        </EmptyState>
      </div>
    );
  }
  if (!page) {
    return (
      <div className="panel article">
        <LoadingState label="Loading page…" />
      </div>
    );
  }

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
    <article className="panel article">
      <p className="eyebrow">
        {page.brand} <span aria-hidden="true">·</span> fictional demo page
      </p>
      <h1 className="article-title">{page.title}</h1>
      <p className="lead">{page.description}</p>

      {page.seo ? (
        <>
          <h2 className="article-section-title">Frequently asked questions</h2>
          <dl className="faq">
            {page.seo.faqs.map((f) => (
              <div key={f.question} className="faq-item">
                <dt>{f.question}</dt>
                <dd>{f.answer}</dd>
              </div>
            ))}
          </dl>
          <details className="disclosure">
            <summary>
              <Icon name="chevron-right" className="disclosure-icon" />
              <span>
                SEO metadata in use{' '}
                <span className="disclosure-meta">(published {new Date(page.seo.publishedAt).toLocaleString()})</span>
              </span>
            </summary>
            <div className="disclosure-body">
              <dl className="meta-list">
                <div>
                  <dt>Title</dt>
                  <dd>{page.seo.seoTitle}</dd>
                </div>
                <div>
                  <dt>Meta description</dt>
                  <dd>{page.seo.metaDescription}</dd>
                </div>
              </dl>
              <p className="hint">FAQPage JSON-LD that a server-rendered page would emit in &lt;head&gt;:</p>
              <pre className="code">{JSON.stringify(faqJsonLd, null, 2)}</pre>
            </div>
          </details>
        </>
      ) : (
        <Alert tone="info">
          <p>No SEO metadata has been approved and published for this page yet.</p>
        </Alert>
      )}
    </article>
  );
}
