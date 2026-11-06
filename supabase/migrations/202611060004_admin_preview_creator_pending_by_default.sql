-- New Preview creator records must enter review, not become active by default.
-- Existing records are unchanged.
alter table preview.preview_creators alter column status set default 'pending_review';
