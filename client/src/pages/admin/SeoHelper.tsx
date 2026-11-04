import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type FieldErrors, type PublishedSeo, type SeoDraft, type SeoSuggestion } from '../../api';
import { Alert, EmptyState, Icon, LoadingState, PageHeader, Spinner } from '../../components/ui';

interface DemoPage {
  pageRef: string;
  brand: string;
  brandName: string;
  title: string;
  description: string;
  published: PublishedSeo | null;
}

const LIMITS = { seoTitle: 60, metaDescription: 160 };
const STATE_LABEL: Record<SeoDraft['state'], string> = {
  draft: 'Draft',
  approved: 'Approved',
  rejected: 'Rejected',
  published: 'Published',
};
type Pending = 'generate' | 'approve' | 'reject' | 'publish' | null;
type StepState = 'done' | 'current' | 'upcoming' | 'rejected';
const STEP_STATE_TEXT: Record<StepState, string> = {
  done: 'completed',
  current: 'current step',
  upcoming: 'not started',
  rejected: 'rejected',
};

function StateBadge({ state }: { state: SeoDraft['state'] }) {
  return <span className={`badge badge-${state}`}>{STATE_LABEL[state]}</span>;
}

/** Visual + textual summary of where the active draft sits in generate -> approve -> publish. */
function Workflow({ draft }: { draft: SeoDraft | null }) {
  const s = draft?.state;
  const steps: { title: string; desc: string; state: StepState }[] = [
    {
      title: 'Generate draft',
      desc: draft ? `Draft #${draft.id} created` : 'Describe the page and ask for a suggestion',
      state: draft ? 'done' : 'current',
    },
    {
      title: 'Review and approve',
      desc:
        s === 'rejected'
          ? 'Rejected. Generate a new draft to try again'
          : s === 'approved' || s === 'published'
            ? `Approved by ${draft?.reviewedBy ?? 'an administrator'}`
            : 'Check, edit and confirm every statement',
      state: s === 'rejected' ? 'rejected' : s === 'approved' || s === 'published' ? 'done' : s === 'draft' ? 'current' : 'upcoming',
    },
    {
      title: 'Publish',
      desc: s === 'published' ? 'Live on the public page' : 'Make the approved metadata public',
      state: s === 'published' ? 'done' : s === 'approved' ? 'current' : 'upcoming',
    },
  ];
  return (
    <ol className="stepper" aria-label="Draft workflow">
      {steps.map((step, idx) => (
        <li key={step.title} className={`step step-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="step-marker" aria-hidden="true">
            {step.state === 'done' ? <Icon name="check" /> : step.state === 'rejected' ? <Icon name="x-circle" /> : idx + 1}
          </span>
          <span className="step-text">
            <span className="step-title">
              {step.title}
              <span className="sr-only"> ({STEP_STATE_TEXT[step.state]})</span>
            </span>
            <span className="step-desc">{step.desc}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Counter({ id, length, limit }: { id: string; length: number; limit: number }) {
  const over = length > limit;
  return (
    <span id={id} className={`counter${over ? ' over' : ''}`}>
      {length}/{limit}
      {over && <span> · {length - limit} over</span>}
    </span>
  );
}

export function SeoHelper() {
  const [pages, setPages] = useState<DemoPage[]>([]);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [provider, setProvider] = useState('');
  const [pageRef, setPageRef] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [description, setDescription] = useState('');
  const [drafts, setDrafts] = useState<SeoDraft[]>([]);
  const [active, setActive] = useState<SeoDraft | null>(null);
  const [edit, setEdit] = useState<SeoSuggestion | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
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
      .catch(() => setError('Could not load demo pages.'))
      .finally(() => setPagesLoaded(true));
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
      setPending(null);
    }
  }

  async function generate() {
    setPending('generate');
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
    setPending('approve');
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
    setPending(action);
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

  const label = (action: Exclude<Pending, null>, idle: string, working: string) =>
    busy && pending === action ? (
      <>
        <Spinner />
        <span>{working}</span>
      </>
    ) : (
      <span>{idle}</span>
    );

  return (
    <section>
      <PageHeader
        eyebrow="Administrator tools"
        title="AI SEO helper"
        description="Draft SEO titles, meta descriptions and FAQs for fictional demo pages. Nothing goes live without your review."
        actions={
          <span className="provider-chip">
            <Icon name="sparkles" />
            <span>
              Provider: <strong>{provider || '…'}</strong>
            </span>
          </span>
        }
      />

      <Alert tone="info" icon="shield" title="Drafts only">
        <p>
          Suggestions are drafts only. Nothing is published until an administrator reviews, approves and publishes
          it. Use fictional page copy only. Never paste customer or enquiry
          data.
        </p>
      </Alert>

      <Workflow draft={active} />

      {error && (
        <Alert tone="error" role="alert">
          <p>{error}</p>
        </Alert>
      )}
      {notice && (
        <Alert tone="success" role="status">
          <p>{notice}</p>
        </Alert>
      )}

      <div className="seo-layout">
        <div className="panel">
          <div className="panel-head">
            <h2>Page input</h2>
            <Link to={`/pages/${pageRef}`} className="panel-head-link">
              View the public page
            </Link>
          </div>
          {!pagesLoaded ? (
            <LoadingState label="Loading demo pages…" />
          ) : pages.length === 0 ? (
            <EmptyState icon="file" title="No demo pages available">
              Demo pages are configured on the server.
            </EmptyState>
          ) : (
            <>
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
                <input id="seo-title" value={pageTitle} maxLength={120} onChange={(e) => setPageTitle(e.target.value)}
                  aria-invalid={!!fieldErrors.pageTitle} aria-describedby={fieldErrors.pageTitle ? 'seo-title-error' : undefined} />
                {fieldErrors.pageTitle && (
                  <p className="field-error" id="seo-title-error">
                    <Icon name="alert" />
                    <span>{fieldErrors.pageTitle[0]}</span>
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="seo-desc">Description (fictional)</label>
                <textarea id="seo-desc" rows={5} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)}
                  aria-invalid={!!fieldErrors.description} aria-describedby={fieldErrors.description ? 'seo-desc-error' : undefined} />
                {fieldErrors.description && (
                  <p className="field-error" id="seo-desc-error">
                    <Icon name="alert" />
                    <span>{fieldErrors.description[0]}</span>
                  </p>
                )}
              </div>
              <button type="button" className="btn btn-primary btn-block" disabled={busy || !pageRef} onClick={() => void generate()} aria-busy={busy && pending === 'generate'}>
                {busy && pending === 'generate' ? (
                  <>
                    <Spinner />
                    <span>Generating…</span>
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" />
                    <span>Generate suggestion</span>
                  </>
                )}
              </button>
              <p className="hint">The public page shows published metadata only.</p>
            </>
          )}

          <h3 className="subhead">History</h3>
          {drafts.length === 0 ? (
            <p className="muted small">No drafts yet for this page.</p>
          ) : (
            <ul className="draft-list">
              {drafts.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`draft-item${active?.id === d.id ? ' is-active' : ''}`}
                    aria-current={active?.id === d.id ? 'true' : undefined}
                    onClick={() => openDraft(d)}
                  >
                    <span className="draft-item-main">
                      <span className="draft-item-id">#{d.id}</span>
                      <span className="draft-item-date">{new Date(d.createdAt).toLocaleString()}</span>
                    </span>
                    <StateBadge state={d.state} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel" aria-busy={busy}>
          <div className="panel-head">
            <h2>Review</h2>
            {active && (
              <span className="panel-head-meta">
                Draft #{active.id} <StateBadge state={active.state} />
              </span>
            )}
          </div>
          {!active || !edit ? (
            <EmptyState icon="sparkles" title="No draft open">
              Generate a suggestion, or open one from the history, to review it here.
            </EmptyState>
          ) : (
            <>
              <p className="muted small draft-byline">
                Created by {active.createdBy} via {active.provider} · {new Date(active.createdAt).toLocaleString()}
              </p>

              {active.warnings.length > 0 && (
                <Alert tone="warn" title="Check before approving:">
                  <ul>
                    {active.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              )}

              <div className="serp" aria-label="Search result preview" role="group">
                <p className="serp-label">Search result preview</p>
                <p className="serp-url">example.test › pages › {active.pageRef}</p>
                <p className="serp-title">{edit.seoTitle || 'Untitled'}</p>
                <p className="serp-desc">{edit.metaDescription}</p>
              </div>

              <div className="field">
                <div className="label-row">
                  <label htmlFor="d-title">SEO title</label>
                  <Counter id="d-title-count" length={edit.seoTitle.length} limit={LIMITS.seoTitle} />
                </div>
                <input id="d-title" value={edit.seoTitle} readOnly={!editable} onChange={(e) => setField('seoTitle', e.target.value)} aria-describedby="d-title-count" />
              </div>
              <div className="field">
                <div className="label-row">
                  <label htmlFor="d-meta">Meta description</label>
                  <Counter id="d-meta-count" length={edit.metaDescription.length} limit={LIMITS.metaDescription} />
                </div>
                <textarea id="d-meta" rows={3} value={edit.metaDescription} readOnly={!editable} onChange={(e) => setField('metaDescription', e.target.value)} aria-describedby="d-meta-count" />
              </div>
              {edit.faqs.map((f, i) => (
                <fieldset key={i} className="faq-edit">
                  <legend>FAQ {i + 1}</legend>
                  <div className="field">
                    <label htmlFor={`q${i}`}>Question</label>
                    <input id={`q${i}`} value={f.question} readOnly={!editable} onChange={(e) => setFaq(i, 'question', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`a${i}`}>Answer</label>
                    <textarea id={`a${i}`} rows={2} value={f.answer} readOnly={!editable} onChange={(e) => setFaq(i, 'answer', e.target.value)} />
                  </div>
                </fieldset>
              ))}
              {Object.keys(fieldErrors).length > 0 && (
                <ul className="field-error-list" role="alert">
                  {Object.entries(fieldErrors).map(([k, v]) => (
                    <li key={k}>{v[0]}</li>
                  ))}
                </ul>
              )}

              {active.state === 'draft' && (
                <div className="decision">
                  <label className="checkbox">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    <span>I have checked every statement against the source and it contains no customer data or unverified claims.</span>
                  </label>
                  <div className="actions">
                    <button type="button" className="btn btn-primary" disabled={busy || !confirmed} onClick={() => void approve()}>
                      {label('approve', changed ? 'Approve with my edits' : 'Approve', 'Approving…')}
                    </button>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void transition('reject')}>
                      {label('reject', 'Reject', 'Rejecting…')}
                    </button>
                  </div>
                </div>
              )}
              {active.state === 'approved' && (
                <div className="decision">
                  <div className="actions">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void transition('publish')}>
                      {label('publish', 'Publish to page', 'Publishing…')}
                    </button>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void transition('reject')}>
                      {label('reject', 'Reject', 'Rejecting…')}
                    </button>
                    <span className="muted small">Approved by {active.reviewedBy}</span>
                  </div>
                </div>
              )}
              {active.state === 'published' && (
                <Alert tone="success" icon="check-circle">
                  <p>
                    Published {active.publishedAt && new Date(active.publishedAt).toLocaleString()}.{' '}
                    <Link to={`/pages/${active.pageRef}`}>View the public page</Link>
                  </p>
                </Alert>
              )}
              {active.state === 'rejected' && (
                <Alert tone="error" icon="x-circle">
                  <p>This draft was rejected and can no longer be edited or published. Generate a new suggestion to start again.</p>
                </Alert>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
