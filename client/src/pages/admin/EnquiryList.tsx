import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Enquiry, type EnquiryStatus, type EnquiryTypeOption } from '../../api';
import { Alert, brandClass, EmptyState, Icon, LoadingState, PageHeader, Spinner } from '../../components/ui';

interface Meta {
  brands: { id: string; name: string; enquiryTypes: EnquiryTypeOption[] }[];
  statuses: EnquiryStatus[];
}
interface ListResponse {
  items: Enquiry[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_LABEL: Record<EnquiryStatus, string> = { new: 'New', in_progress: 'In progress', closed: 'Closed' };
const LIMIT = 20;

function Received({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <time dateTime={iso} className="received">
      <span>{d.toLocaleDateString()}</span>
      <span className="muted">{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </time>
  );
}

export function EnquiryList() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [brand, setBrand] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saved, setSaved] = useState<{ id: number; label: string } | null>(null);

  useEffect(() => {
    document.title = 'Enquiries - Group Enquiry Desk';
    api<Meta>('/api/enquiries/meta').then(setMeta).catch(() => setError('Could not load filters.'));
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (brand) q.set('brand', brand);
    if (status) q.set('status', status);
    setLoading(true);
    try {
      setData(await api<ListResponse>(`/api/enquiries?${q.toString()}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load enquiries.');
    } finally {
      setLoading(false);
    }
  }, [brand, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const brandName = (id: string) => meta?.brands.find((b) => b.id === id)?.name ?? id;
  const typeLabel = (b: string, t: string) =>
    meta?.brands.find((x) => x.id === b)?.enquiryTypes.find((x) => x.value === t)?.label ?? t;

  async function changeStatus(item: Enquiry, next: EnquiryStatus) {
    setSavingId(item.id);
    setSaved(null);
    try {
      const r = await api<{ item: Enquiry }>(`/api/enquiries/${item.id}/status`, { method: 'PATCH', body: { status: next } });
      setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === item.id ? r.item : i)) } : d));
      setError(null);
      setSaved({ id: item.id, label: STATUS_LABEL[r.item.status] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update status.');
    } finally {
      setSavingId(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const filtered = brand !== '' || status !== '';
  const clearFilters = () => {
    setBrand('');
    setStatus('');
    setPage(1);
  };
  const first = data && data.total > 0 ? (page - 1) * LIMIT + 1 : 0;
  const last = data ? Math.min(page * LIMIT, data.total) : 0;

  return (
    <section>
      <PageHeader
        eyebrow="Staff workspace"
        title="Enquiries"
        description="Every enquiry submitted through the five brand forms. Change a status to keep the team in sync."
      />

      <div className="toolbar" role="search" aria-label="Filter enquiries">
        <div className="toolbar-filters">
          <div className="field field-inline">
            <label htmlFor="filter-brand">Brand</label>
            <select id="filter-brand" value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}>
              <option value="">All brands</option>
              {meta?.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field field-inline">
            <label htmlFor="filter-status">Status</label>
            <select id="filter-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">Any status</option>
              {meta?.statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {filtered && (
            <button type="button" className="btn btn-ghost btn-sm toolbar-clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        <p className="toolbar-count" aria-live="polite">
          {loading && <Spinner />}
          <span>{data ? `${data.total} result${data.total === 1 ? '' : 's'}` : ''}</span>
        </p>
      </div>

      {error && (
        <Alert
          tone="error"
          role="alert"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
              <Icon name="refresh" />
              <span>Retry</span>
            </button>
          }
        >
          <p>{error}</p>
        </Alert>
      )}

      {/* Announces successful status changes to screen readers without moving focus. */}
      <p className="sr-only" role="status">
        {saved ? `Enquiry ${saved.id} marked ${saved.label}.` : ''}
      </p>

      {!data && loading && (
        <div className="panel">
          <LoadingState label="Loading enquiries…" />
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="panel">
          {filtered ? (
            <EmptyState
              icon="filter"
              title="No enquiries match these filters"
              action={
                <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              }
            >
              Try a different brand or status.
            </EmptyState>
          ) : (
            <EmptyState title="No enquiries yet">New enquiries from the public forms will appear here.</EmptyState>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={`table-wrap${loading ? ' is-refreshing' : ''}`} aria-busy={loading}>
          <table className="enquiries">
            <caption className="sr-only">
              Enquiries{data.total > 0 ? `, showing ${first} to ${last} of ${data.total}` : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">Brand</th>
                <th scope="col">Contact</th>
                <th scope="col">Type</th>
                <th scope="col">Message</th>
                <th scope="col">Preferred date</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id}>
                  <td data-label="Received">
                    <Received iso={i.createdAt} />
                  </td>
                  <td data-label="Brand">
                    <span className={`brand-tag ${brandClass(i.brand)}`}>
                      <span className="brand-dot" aria-hidden="true" />
                      {brandName(i.brand)}
                    </span>
                  </td>
                  <td data-label="Contact">
                    {/* Rendered as text by React: stored markup is displayed, never executed. */}
                    <div className="contact-name">{i.fullName}</div>
                    <div className="contact-email muted">{i.email}</div>
                  </td>
                  <td data-label="Type">{typeLabel(i.brand, i.enquiryType)}</td>
                  <td data-label="Message" className="message-cell">{i.message}</td>
                  <td data-label="Preferred date" className="nowrap">{i.preferredDate ?? '-'}</td>
                  <td data-label="Status">
                    <div className="status-cell">
                      <select
                        className={`status-select status-${i.status}`}
                        aria-label={`Status for enquiry ${i.id}`}
                        value={i.status}
                        disabled={savingId === i.id}
                        onChange={(e) => void changeStatus(i, e.target.value as EnquiryStatus)}
                      >
                        {(meta?.statuses ?? (['new', 'in_progress', 'closed'] as EnquiryStatus[])).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      {savingId === i.id && (
                        <span className="status-note">
                          <Spinner />
                          <span>Saving</span>
                        </span>
                      )}
                      {saved?.id === i.id && savingId !== i.id && (
                        <span className="status-note status-note-ok" aria-hidden="true">
                          <Icon name="check" />
                          <span>Saved</span>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <nav className="pager" aria-label="Pagination">
          <p className="pager-summary">
            Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{data.total}</strong>
          </p>
          {pages > 1 && (
            <div className="pager-controls">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <Icon name="chevron-left" />
                <span>Previous</span>
              </button>
              <span className="pager-page">
                Page {page} of {pages}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                <span>Next</span>
                <Icon name="chevron-right" />
              </button>
            </div>
          )}
        </nav>
      )}
    </section>
  );
}
