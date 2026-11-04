import type { SeoGenerationInput } from '../ai/provider';
import { seoSuggestionSchema, type SeoSuggestion } from '../ai/seoSchema';
import type { BrandId } from '../config/brands';
import { NOW_SQL, type DB, type Row } from './db';

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

export async function createDraft(
  db: DB,
  d: { pageRef: string; brand: BrandId; input: SeoGenerationInput; output: SeoSuggestion; warnings: string[]; provider: string; userId: number },
): Promise<number> {
  const info = await db.run(
    `INSERT INTO seo_drafts (page_ref, brand, input_json, output_json, warnings_json, provider, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [d.pageRef, d.brand, JSON.stringify(d.input), JSON.stringify(d.output), JSON.stringify(d.warnings), d.provider, d.userId],
  );
  return info.lastInsertRowid;
}

const getDraftRow = (db: DB, id: number) => db.get<DraftRow>(`${SELECT_DRAFT} WHERE d.id = ?`, [id]);

export async function getDraft(db: DB, id: number): Promise<SeoDraftDto | undefined> {
  const row = await getDraftRow(db, id);
  return row ? toDto(row) : undefined;
}

export async function listDrafts(db: DB, pageRef?: string): Promise<SeoDraftDto[]> {
  const rows = await db.all<DraftRow>(
    `${SELECT_DRAFT} WHERE (@pageRef IS NULL OR d.page_ref = @pageRef) ORDER BY d.created_at DESC, d.id DESC LIMIT 50`,
    { pageRef: pageRef ?? null },
  );
  return rows.map(toDto);
}

export type TransitionResult =
  | { ok: true; draft: SeoDraftDto }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_state'; state: DraftState };

/**
 * Each transition is one atomic batch: a guarded UPDATE whose WHERE clause encodes the allowed
 * source states, followed by a read of the draft. If the UPDATE changed nothing, the read tells
 * us whether the draft is missing or in the wrong state. No read-then-write race is possible.
 */
function transitionResult(changed: boolean, row: Row | undefined): TransitionResult {
  if (!row) return { ok: false, reason: 'not_found' };
  const draft = toDto(row as unknown as DraftRow);
  return changed ? { ok: true, draft } : { ok: false, reason: 'invalid_state', state: draft.state };
}

/** draft -> approved, optionally with reviewer edits (already validated by the caller). */
export async function approveDraft(
  db: DB,
  id: number,
  userId: number,
  edited?: { output: SeoSuggestion; warnings: string[] },
): Promise<TransitionResult> {
  const [update, select] = await db.batch([
    {
      sql: `UPDATE seo_drafts SET output_json = COALESCE(@output, output_json),
              warnings_json = COALESCE(@warnings, warnings_json),
              state = 'approved', reviewed_by = @userId, reviewed_at = ${NOW_SQL}
            WHERE id = @id AND state = 'draft'`,
      args: {
        id,
        userId,
        output: edited ? JSON.stringify(edited.output) : null,
        warnings: edited ? JSON.stringify(edited.warnings) : null,
      },
    },
    { sql: `${SELECT_DRAFT} WHERE d.id = ?`, args: [id] },
  ]);
  return transitionResult(update?.changes === 1, select?.rows[0]);
}

/** draft or approved -> rejected. */
export async function rejectDraft(db: DB, id: number, userId: number): Promise<TransitionResult> {
  const [update, select] = await db.batch([
    {
      sql: `UPDATE seo_drafts SET state = 'rejected', reviewed_by = @userId, reviewed_at = ${NOW_SQL}
            WHERE id = @id AND state IN ('draft', 'approved')`,
      args: { id, userId },
    },
    { sql: `${SELECT_DRAFT} WHERE d.id = ?`, args: [id] },
  ]);
  return transitionResult(update?.changes === 1, select?.rows[0]);
}

/** approved -> published. Only this function writes page_seo, which is what the public site reads. */
export async function publishDraft(db: DB, id: number, userId: number): Promise<TransitionResult> {
  const row = await getDraftRow(db, id);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.state !== 'approved') return { ok: false, reason: 'invalid_state', state: row.state };

  // Defence in depth: re-validate the stored content before it becomes public.
  const output = seoSuggestionSchema.parse(JSON.parse(row.output_json));

  // Both writes are guarded on the exact output_json that was just validated, so a concurrent
  // edit or state change between the read above and this batch publishes nothing.
  const guard = `id = @draftId AND state = 'approved' AND output_json = @outputJson`;
  const [, update, select] = await db.batch([
    {
      sql: `INSERT INTO page_seo (page_ref, seo_title, meta_description, faqs_json, draft_id, published_by)
            SELECT @pageRef, @title, @meta, @faqs, @draftId, @userId FROM seo_drafts WHERE ${guard}
            ON CONFLICT (page_ref) DO UPDATE SET seo_title = excluded.seo_title,
              meta_description = excluded.meta_description, faqs_json = excluded.faqs_json,
              draft_id = excluded.draft_id, published_by = excluded.published_by, published_at = ${NOW_SQL}`,
      args: {
        pageRef: row.page_ref,
        title: output.seoTitle,
        meta: output.metaDescription,
        faqs: JSON.stringify(output.faqs),
        draftId: id,
        userId,
        outputJson: row.output_json,
      },
    },
    {
      sql: `UPDATE seo_drafts SET state = 'published', published_at = ${NOW_SQL} WHERE ${guard}`,
      args: { draftId: id, outputJson: row.output_json },
    },
    { sql: `${SELECT_DRAFT} WHERE d.id = ?`, args: [id] },
  ]);
  return transitionResult(update?.changes === 1, select?.rows[0]);
}

export interface PublishedSeo {
  seoTitle: string;
  metaDescription: string;
  faqs: SeoSuggestion['faqs'];
  publishedAt: string;
}

export async function getPublishedSeo(db: DB, pageRef: string): Promise<PublishedSeo | undefined> {
  const row = await db.get<Omit<PublishedSeo, 'faqs'> & { faqs: string }>(
    `SELECT seo_title AS seoTitle, meta_description AS metaDescription, faqs_json AS faqs, published_at AS publishedAt
     FROM page_seo WHERE page_ref = ?`,
    [pageRef],
  );
  return row ? { ...row, faqs: JSON.parse(row.faqs) as SeoSuggestion['faqs'] } : undefined;
}
