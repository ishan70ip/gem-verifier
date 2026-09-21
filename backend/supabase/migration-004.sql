-- Migration 004: explicit vendor rejections (run once in SQL Editor).
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS rejections (
  "_id" UUID PRIMARY KEY,
  "tenderId" UUID,
  "evaluationId" UUID,
  "vendorId" UUID REFERENCES vendors("_id"),
  reason TEXT,
  status TEXT DEFAULT 'REJECTED',
  "decidedBy" UUID,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rejections_eval ON rejections("evaluationId", "vendorId");
ALTER TABLE rejections ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon read all' AND tablename = 'rejections') THEN
    CREATE POLICY "anon read all" ON rejections FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rejections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rejections;
  END IF;
END $$;
