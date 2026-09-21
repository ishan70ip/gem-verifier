-- Production reset: wipe ALL application data (run in SQL Editor).
-- Schema, bucket, policies and RLS stay untouched. Safe to re-run.
-- After this: re-seed from your laptop (see below), then re-analyze.
TRUNCATE
  documents,
  audit_logs,
  rejections,
  contract_awards,
  compliance_results,
  evaluations,
  bids,
  tender_requirements,
  tenders,
  vendors,
  users
CASCADE;
