import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type FieldErrors, type PublishedSeo, type SeoDraft, type SeoSuggestion } from '../../api';

interface DemoPage {
  pageRef: string;
  brand: string;
  brandName: string;
  title: string;
  description: string;
  published: PublishedSeo | null;
}

const LIMITS = { seoTitle: 60, metaDescription: 160 };

export function SeoHelper() {
  const [pages, setPages] = useState<DemoPage[]>([]);
  const [provider, setProvider] = useState('');
  const [pageRef, setPageRef] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [description, setDescription] = useState('');
  const [drafts, setDrafts] = useState<SeoDraft[]>([]);
  const [active, setActive] = useState<SeoDraft | null>(null);
  const [edit, setEdit] = useState<SeoSuggestion | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'AI SEO helper - Group Enquiry Desk';
    api<{ provider: string; pages: DemoPage[] }>('/api/ai/pages')
      .then((r) => {
        setProvider(r.provider);
        setPages(r.pages);
        const first = r.pages[0];
        if (first) {
          setPageRef(first.pageRef);
          setPageTitle(first.title);
          setDescription(first.description);
        }
      })
      .catch(() => setError('Could not load demo pages.'));
  }, []);

  const loadDrafts = useCallback(async (ref: string) => {
    if (!ref) return;
    const r = await api<{ drafts: SeoDraft[] }>(`/api/ai/seo-drafts?pageRef=${encodeURIComponent(ref)}`);
    setDrafts(r.drafts);
  }, []);

  useEffect(() => {
    void loadDrafts(pageRef).catch(() => undefined);
  }, [pageRef, loadDrafts]);

  function selectPage(ref: string) {
    const p = pages.find((x) => x.pageRef === ref);
    setPageRef(ref);
    if (p) {
      setPageTitle(p.title);
      setDescription(p.description);
    }
    setActive(null);
    setEdit(null);
  }

  function openDraft(d: SeoDraft) {
    setActive(d);
    setEdit(structuredClone(d.output));
    setConfirmed(false);
    setFieldErrors({});
  }

  async function run<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const r = await fn();
      if (ok) setNotice(ok);
      return r;
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (e.fields) setFieldErrors(e.fields);
      } else setError('Unexpected error.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    const r = await run(() =>
      api<{ draft: SeoDraft; redactions: number }>('/api/ai/seo-drafts', { method: 'POST', body: { pageRef, pageTitle, description } }),
    );
    if (!r) return;
    openDraft(r.draft);
    if (r.redactions > 0) setNotice(`${r.redactions} item(s) of possible personal data were redacted before sending to the provider.`);
    await loadDrafts(pageRef);
  }

  const changed = active && edit && JSON.stringify(edit) !== JSON.stringify(active.output);

  async function approve() {
    if (!active || !edit) return;
    const r = await run(
      () => api<{ draft: SeoDraft }>(`/api/ai/seo-drafts/${active.id}/approve`, { method: 'POST', body: changed ? { output: edit } : {} }),
      'Approved. Review once more, then publish.',
    );
    if (r) {
      openDraft(r.draft);
      await loadDrafts(pageRef);
    }
  }

  async function transition(action: 'reject' | 'publish') {
    if (!active) return;
    const r = await run(
      () => api<{ draft: SeoDraft }>(`/api/ai/seo-drafts/${active.id}/${action}`, { method: 'POST' }),
      action === 'publish' ? 'Published. The public page now uses this metadata.' : 'Draft rejected.',
    );
    if (r) {
      openDraft(r.draft);
      await loadDrafts(pageRef);
    }
  }

  const editable = active?.state === 'draft';
  const setField = (k: 'seoTitle' | 'metaDescription', v: string) => setEdit((e) => (e ? { ...e, [k]: v } : e));
  const setFaq = (i: number, k: 'question' | 'answer', v: string) =>
    setEdit((e) => (e ? { ...e, faqs: e.faqs.map((f, j) => (j === i ? { ...f, [k]: v } : f)) } : e));

  return (
    <section>
      <h1>AI SEO helper</h1>
      <p className="alert alert-info">
        Provider: <strong>{provider || '…'}</strong>. Suggestions are drafts only. Nothing is published until an
        administrator reviews, approves and publishes it. Use fictional page copy only. Never paste customer or enquiry data.
      </p>

      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {notice && <p className="alert alert-success" role="status">{notice}</p>}

      <div className="grid-2">
        <div className="panel">
          <h2>1. Page input</h2>
          <div className="field">
            <label htmlFor="seo-page">Demo page</label>
            <select id="seo-page" value={pageRef} onChange={(e) => selectPage(e.target.value)}>
              {pages.map((p) => (
                <option key={p.pageRef} value={p.pageRef}>
                  {p.brandName}: {p.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="seo-title">Page title</label>
            <input id="seo-title" value={pageTitle} maxLength={120} onChange={(e) => setPageTitle(e.target.value)} />
            {fieldErrors.pageTitle && <p className="field-error">{fieldErrors.pageTitle[0]}</p>}
          </div>
          <div className="field">
            <label htmlFor="seo-desc">Description (fictional)</label>
            <textarea id="seo-desc" rows={5} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
            {fieldErrors.description && <p className="field-error">{fieldErrors.description[0]}</p>}
          </div>
          <button type="button" className="btn btn-primary" disabled={busy || !pageRef} onClick={() => void generate()}>
            {busy ? 'Working…' : 'Generate suggestion'}
          </button>
          <p className="hint">
            <Link to={`/pages/${pageRef}`}>View the public page</Link> (shows published metadata only)
          </p>

          <h3>History</h3>
          {drafts.length === 0 ? (
            <p className="muted">No drafts yet.</p>
          ) : (
            <ul className="draft-list">
              {drafts.map((d) => (
                <li key={d.id}>
                  <button type="button" className="link-btn" onClick={() => openDraft(d)}>
                    #{d.id} · {new Date(d.createdAt).toLocaleString()}
                  </button>{' '}
                  <span className={`badge badge-${d.state}`}>{d.state}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2>2. Review and approve</h2>
          {!active || !edit ? (
            <p className="muted">Generate or open a draft to review it.</p>
          ) : (
            <>
              <p>
                Draft #{active.id} <span className={`badge badge-${active.state}`}>{active.state}</span>{' '}
                <span className="muted">by {active.createdBy} via {active.provider}</span>
              </p>

              {active.warnings.length > 0 && (
                <div className="alert alert-warn">
                  <strong>Check before approving:</strong>
                  <ul>
                    {active.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="field">
                <label htmlFor="d-title">SEO title</label>
                <input id="d-title" value={edit.seoTitle} readOnly={!editable} onChange={(e) => setField('seoTitle', e.target.value)} />
                <p className={`hint ${edit.seoTitle.length > LIMITS.seoTitle ? 'over' : ''}`}>{edit.seoTitle.length}/{LIMITS.seoTitle}</p>
              </div>
              <div className="field">
                <label htmlFor="d-meta">Meta description</label>
                <textarea id="d-meta" rows={3} value={edit.metaDescription} readOnly={!editable} onChange={(e) => setField('metaDescription', e.target.value)} />
                <p className={`hint ${edit.metaDescription.length > LIMITS.metaDescription ? 'over' : ''}`}>
                  {edit.metaDescription.length}/{LIMITS.metaDescription}
                </p>
              </div>
              {edit.faqs.map((f, i) => (
                <fieldset key={i} className="faq-edit">
                  <legend>FAQ {i + 1}</legend>
                  <label htmlFor={`q${i}`}>Question</label>
                  <input id={`q${i}`} value={f.question} readOnly={!editable} onChange={(e) => setFaq(i, 'question', e.target.value)} />
                  <label htmlFor={`a${i}`}>Answer</label>
                  <textarea id={`a${i}`} rows={2} value={f.answer} readOnly={!editable} onChange={(e) => setFaq(i, 'answer', e.target.value)} />
                </fieldset>
              ))}
              {Object.keys(fieldErrors).length > 0 && (
                <ul className="field-error">
                  {Object.entries(fieldErrors).map(([k, v]) => (
                    <li key={k}>{v[0]}</li>
                  ))}
                </ul>
              )}

              {active.state === 'draft' && (
                <>
                  <label className="checkbox">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    I have checked every statement against the source and it contains no customer data or unverified claims.
                  </label>
                  <div className="actions">
                    <button type="button" className="btn btn-primary" disabled={busy || !confirmed} onClick={() => void approve()}>
                      {changed ? 'Approve with my edits' : 'Approve'}
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => void transition('reject')}>
                      Reject
                    </button>
                  </div>
                </>
              )}
              {active.state === 'approved' && (
                <div className="actions">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void transition('publish')}>
                    Publish to page
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => void transition('reject')}>
                    Reject
                  </button>
                  <span className="muted">Approved by {active.reviewedBy}</span>
                </div>
              )}
              {active.state === 'published' && <p className="muted">Published {active.publishedAt && new Date(active.publishedAt).toLocaleString()}.</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
