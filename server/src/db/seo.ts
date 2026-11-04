import type { SeoGenerationInput } from '../ai/provider';
import { seoSuggestionSchema, type SeoSuggestion } from '../ai/seoSchema';
import type { BrandId } from '../config/brands';
import type { DB } from './db';

export type DraftState = 'draft' | 'approved' | 'rejected' | 'published';

export interface SeoDraftDto {
  id: number;
  pageRef: string;
  brand: BrandId;
  input: SeoGenerationInput;
  output: SeoSuggestion;
  warnings: string[];
  provider: string;
  state: DraftState;
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface DraftRow {
  id: number;
  page_ref: string;
  brand: BrandId;
  input_json: string;
  output_json: string;
  warnings_json: string;
  provider: string;
  state: DraftState;
  created_by_email: string;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
}

const SELECT_DRAFT = `
  SELECT d.*, cu.email AS created_by_email, ru.email AS reviewed_by_email
  FROM seo_drafts d
  JOIN users cu ON cu.id = d.created_by
  LEFT JOIN users ru ON ru.id = d.reviewed_by`;

const toDto = (r: DraftRow): SeoDraftDto => ({
  id: r.id,
  pageRef: r.page_ref,
  brand: r.brand,
  input: JSON.parse(r.input_json) as SeoGenerationInput,
  output: JSON.parse(r.output_json) as SeoSuggestion,
  warnings: JSON.parse(r.warnings_json) as string[],
  provider: r.provider,
  state: r.state,
  createdBy: r.created_by_email,
  reviewedBy: r.reviewed_by_email,
  reviewedAt: r.reviewed_at,
  publishedAt: r.published_at,
  createdAt: r.created_at,
});

export function createDraft(
  db: DB,
  d: { pageRef: string; brand: BrandId; input: SeoGenerationInput; output: SeoSuggestion; warnings: string[]; provider: string; userId: number },
): number {
  const info = db
    .prepare(
      `INSERT INTO seo_drafts (page_ref, brand, input_json, output_json, warnings_json, provider, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(d.pageRef, d.brand, JSON.stringify(d.input), JSON.stringify(d.output), JSON.stringify(d.warnings), d.provider, d.userId);
  return Number(info.lastInsertRowid);
}

export function getDraft(db: DB, id: number): SeoDraftDto | undefined {
  const row = db.prepare(`${SELECT_DRAFT} WHERE d.id = ?`).get(id) as DraftRow | undefined;
  return row ? toDto(row) : undefined;
}

export function listDrafts(db: DB, pageRef?: string): SeoDraftDto[] {
  const rows = db
    .prepare(`${SELECT_DRAFT} WHERE (@pageRef IS NULL OR d.page_ref = @pageRef) ORDER BY d.created_at DESC, d.id DESC LIMIT 50`)
    .all({ pageRef: pageRef ?? null }) as DraftRow[];
  return rows.map(toDto);
}

export type TransitionResult =
  | { ok: true; draft: SeoDraftDto }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_state'; state: DraftState };

const NOW_SQL = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/** draft -> approved, optionally with reviewer edits (already validated by the caller). */
export function approveDraft(
  db: DB,
  id: number,
  userId: number,
  edited?: { output: SeoSuggestion; warnings: string[] },
): TransitionResult {
  return db.transaction((): TransitionResult => {
    const draft = getDraft(db, id);
    if (!draft) return { ok: false, reason: 'not_found' };
    if (draft.state !== 'draft') return { ok: false, reason: 'invalid_state', state: draft.state };
    if (edited) {
      db.prepare(`UPDATE seo_drafts SET output_json = ?, warnings_json = ? WHERE id = ?`).run(
        JSON.stringify(edited.output),
        JSON.stringify(edited.warnings),
        id,
      );
    }
    db.prepare(`UPDATE seo_drafts SET state = 'approved', reviewed_by = ?, reviewed_at = ${NOW_SQL} WHERE id = ?`).run(userId, id);
    return { ok: true, draft: getDraft(db, id)! };
  })();
}

export function rejectDraft(db: DB, id: number, userId: number): TransitionResult {
  return db.transaction((): TransitionResult => {
    const draft = getDraft(db, id);
    if (!draft) return { ok: false, reason: 'not_found' };
    if (draft.state !== 'draft' && draft.state !== 'approved') {
      return { ok: false, reason: 'invalid_state', state: draft.state };
    }
    db.prepare(`UPDATE seo_drafts SET state = 'rejected', reviewed_by = ?, reviewed_at = ${NOW_SQL} WHERE id = ?`).run(userId, id);
    return { ok: true, draft: getDraft(db, id)! };
  })();
}

/** approved -> published. Only this function writes page_seo, which is what the public site reads. */
export function publishDraft(db: DB, id: number, userId: number): TransitionResult {
  return db.transaction((): TransitionResult => {
    const draft = getDraft(db, id);
    if (!draft) return { ok: false, reason: 'not_found' };
    if (draft.state !== 'approved') return { ok: false, reason: 'invalid_state', state: draft.state };

    // Defence in depth: re-validate the stored content before it becomes public.
    const output = seoSuggestionSchema.parse(draft.output);
    db.prepare(
      `INSERT INTO page_seo (page_ref, seo_title, meta_description, faqs_json, draft_id, published_by)
       VALUES (@pageRef, @title, @meta, @faqs, @draftId, @userId)
       ON CONFLICT (page_ref) DO UPDATE SET seo_title = excluded.seo_title,
         meta_description = excluded.meta_description, faqs_json = excluded.faqs_json,
         draft_id = excluded.draft_id, published_by = excluded.published_by, published_at = ${NOW_SQL}`,
    ).run({
      pageRef: draft.pageRef,
      title: output.seoTitle,
      meta: output.metaDescription,
      faqs: JSON.stringify(output.faqs),
      draftId: id,
      userId,
    });
    db.prepare(`UPDATE seo_drafts SET state = 'published', published_at = ${NOW_SQL} WHERE id = ?`).run(id);
    return { ok: true, draft: getDraft(db, id)! };
  })();
}

export interface PublishedSeo {
  seoTitle: string;
  metaDescription: string;
  faqs: SeoSuggestion['faqs'];
  publishedAt: string;
}

export function getPublishedSeo(db: DB, pageRef: string): PublishedSeo | undefined {
  const row = db
    .prepare(
      `SELECT seo_title AS seoTitle, meta_description AS metaDescription, faqs_json AS faqs, published_at AS publishedAt
       FROM page_seo WHERE page_ref = ?`,
    )
    .get(pageRef) as (Omit<PublishedSeo, 'faqs'> & { faqs: string }) | undefined;
  return row ? { ...row, faqs: JSON.parse(row.faqs) as SeoSuggestion['faqs'] } : undefined;
}
