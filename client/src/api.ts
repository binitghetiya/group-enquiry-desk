export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: FieldErrors,
  ) {
    super(message);
  }
}

// Held in memory only (never localStorage), so it is not readable after a page reload or by other tabs' scripts.
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; fields?: FieldErrors } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? 'Request failed.', err?.fields);
  }
  return data as T;
}

// ---- DTOs shared with the server ----
export type Role = 'admin' | 'staff';
export interface User {
  id: number;
  email: string;
  role: Role;
}
export interface EnquiryTypeOption {
  value: string;
  label: string;
}
export type EnquiryStatus = 'new' | 'in_progress' | 'closed';
export interface Enquiry {
  id: number;
  brand: string;
  fullName: string;
  email: string;
  enquiryType: string;
  message: string;
  preferredDate: string | null;
  status: EnquiryStatus;
  createdAt: string;
  updatedAt: string;
}
export interface Faq {
  question: string;
  answer: string;
}
export interface SeoSuggestion {
  seoTitle: string;
  metaDescription: string;
  faqs: Faq[];
}
export interface SeoDraft {
  id: number;
  pageRef: string;
  brand: string;
  output: SeoSuggestion;
  warnings: string[];
  provider: string;
  state: 'draft' | 'approved' | 'rejected' | 'published';
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}
export interface PublishedSeo extends SeoSuggestion {
  publishedAt: string;
}
