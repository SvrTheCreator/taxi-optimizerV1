-- 003_manual_workers.sql
-- «Кнопочные» работники без приложения: админ ведёт список (имя+адрес) и
-- каждый день отмечает, кто едет и во сколько. В оптимизацию попадают наравне.
-- Выполнить один раз в Supabase SQL Editor (выбрать "Run without RLS").

-- 1) Список людей без приложения (заводится один раз)
CREATE TABLE IF NOT EXISTS manual_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Назначения на конкретный день/время (одно на человека в день)
CREATE TABLE IF NOT EXISTS manual_shift_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_worker_id UUID NOT NULL REFERENCES manual_workers(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  shift_time TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(manual_worker_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_manual_shift_date ON manual_shift_entries(shift_date);

ALTER TABLE manual_workers DISABLE ROW LEVEL SECURITY;
ALTER TABLE manual_shift_entries DISABLE ROW LEVEL SECURITY;
