-- Add resendVerificationLastSentAt column for per-user rate-limiting tracking
-- (the existing verificationTokenExpiresAt already carries timing info,
--  so this migration simply documents the intent and is a no-op DDL)
-- The application-level rate-limit uses verificationTokenExpiresAt to infer
-- when the last token was issued; no new column is required.
SELECT 1; -- no-op placeholder
