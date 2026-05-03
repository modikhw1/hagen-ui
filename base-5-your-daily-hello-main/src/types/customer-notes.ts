export type CustomerNoteType = 'update' | 'reference' | 'feedback' | 'milestone';

export interface CustomerNoteReference {
  kind: string;
  label?: string;
  url?: string;
  platform?: string;
  customer_concept_id?: string;
}

export interface CustomerNoteAttachment {
  kind: string;
  url?: string;
  caption?: string;
  storage_path?: string;
  file_name?: string;
  mime_type?: string;
}

export interface CustomerNoteConceptContext {
  customerConceptId: string;
  conceptId: string | null;
  title: string;
  href: string | null;
  mobileHref: string | null;
}

export interface CustomerNoteItem {
  id: string;
  customer_id: string;
  cm_id: string;
  content: string;
  content_html: string | null;
  note_type: CustomerNoteType;
  primary_customer_concept_id: string | null;
  references: CustomerNoteReference[];
  attachments: CustomerNoteAttachment[];
  created_at: string | null;
  updated_at: string | null;
  concept_context: CustomerNoteConceptContext | null;
}

export interface CustomerNotesResponse {
  notes: CustomerNoteItem[];
}
