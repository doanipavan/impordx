/**
 * What a file is, chosen by whoever uploads it. Decided 21 Sep 2026.
 *
 * Four categories, one rule: every new upload carries one — the database
 * refuses a file without it (migration 045). Files from before that day
 * have none and may stay that way; the rule is forward-only.
 *
 * Sample and PI go into Redantex's review the moment they land; reference and
 * quotation never do. The trigger sets review_status from the category, so
 * nothing here needs to.
 */

export type AttachmentKind = 'reference' | 'sample' | 'pi' | 'quotation'

export const ATTACHMENT_KINDS: Array<{ id: AttachmentKind; label: string; hint: string }> = [
  { id: 'reference', label: 'Reference', hint: 'Artwork, logos, photos the piece is based on' },
  { id: 'sample', label: 'Sample', hint: 'The sample as made — goes to Redantex for approval' },
  { id: 'pi', label: 'PI', hint: 'The proforma invoice — goes to Redantex for approval' },
  { id: 'quotation', label: 'Quotation', hint: 'A price quotation' },
]

/** The two categories that get a verdict. */
export const REVIEWED_KINDS: readonly AttachmentKind[] = ['sample', 'pi']

export function isReviewed(kind: string | null | undefined): kind is 'sample' | 'pi' {
  return kind === 'sample' || kind === 'pi'
}

export function kindLabel(kind: string | null | undefined): string {
  return ATTACHMENT_KINDS.find(k => k.id === kind)?.label ?? 'Uncategorised'
}

/** A file waiting to be uploaded, and what the uploader says it is. */
export interface QueuedFile {
  file: File
  kind: AttachmentKind | null
}

export const allCategorised = (queue: QueuedFile[]) => queue.every(q => q.kind !== null)
