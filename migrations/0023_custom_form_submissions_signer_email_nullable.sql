-- Task #225: Allow Hold Harmless (and any other custom form) to be sent
-- via SMS only, without an email address.
--
-- The ad-hoc Hold Harmless dialog accepts recipients who have a phone but
-- no email. The server insert into custom_form_submissions then writes a
-- NULL signer_email, which previously violated the NOT NULL column
-- constraint and surfaced to staff as a toast error. Making the column
-- nullable matches the shared/schema.ts declaration and unblocks the
-- SMS-only send path end-to-end. App-level routes that still require an
-- email (e.g. /api/custom-forms/:id/send and /api/public-waiver/sign)
-- continue to enforce that requirement themselves; this migration only
-- relaxes the column constraint so it stops being the bottleneck for
-- legitimately email-less sends.

ALTER TABLE custom_form_submissions
  ALTER COLUMN signer_email DROP NOT NULL;
