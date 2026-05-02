begin;

alter type public.attention_subject_type add value if not exists 'cm_assignment';
alter type public.attention_subject_type add value if not exists 'subscription_pause_resume';
alter type public.attention_subject_type add value if not exists 'cm_activity';

commit;
