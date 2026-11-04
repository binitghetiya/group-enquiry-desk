import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Enquiry, type EnquiryStatus, type EnquiryTypeOption } from '../../api';

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

export function EnquiryList() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [brand, setBrand] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Enquiries - Group Enquiry Desk';
    api<Meta>('/api/enquiries/meta').then(setMeta).catch(() => setError('Could not load filters.'));
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (brand) q.set('brand', brand);
    if (status) q.set('status', status);
    try {
      setData(await api<ListResponse>(`/api/enquiries?${q.toString()}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load enquiries.');
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
    try {
      const r = await api<{ item: Enquiry }>(`/api/enquiries/${item.id}/status`, { method: 'PATCH', body: { status: next } });
      setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === item.id ? r.item : i)) } : d));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update status.');
    } finally {
      setSavingId(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <section>
      <h1>Enquiries</h1>
      <div className="filters">
        <label>
          Brand
          <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}>
            <option value="">All brands</option>
            {meta?.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Any status</option>
            {meta?.statuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">{data ? `${data.total} result${data.total === 1 ? '' : 's'}` : ''}</span>
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {data && data.items.length === 0 && <p className="muted">No enquiries match these filters.</p>}

      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="enquiries">
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
                  <td data-label="Received">{new Date(i.createdAt).toLocaleString()}</td>
                  <td data-label="Brand">{brandName(i.brand)}</td>
                  <td data-label="Contact">
                    {/* Rendered as text by React: stored markup is displayed, never executed. */}
                    <div>{i.fullName}</div>
                    <div className="muted">{i.email}</div>
                  </td>
                  <td data-label="Type">{typeLabel(i.brand, i.enquiryType)}</td>
                  <td data-label="Message" className="message-cell">{i.message}</td>
                  <td data-label="Preferred date">{i.preferredDate ?? '-'}</td>
                  <td data-label="Status">
                    <select
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <div className="pager">
          <button type="button" className="btn btn-small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" className="btn btn-small" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
