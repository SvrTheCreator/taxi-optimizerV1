-- 002_registration_codes.sql
-- Коды регистрации, которые выдаёт админ работникам без рабочего Telegram.
-- Выполнить один раз в Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS registration_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,                         -- 6-значный код, который админ диктует работнику
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- Быстрый поиск активного кода
CREATE INDEX IF NOT EXISTS idx_registration_codes_active
  ON registration_codes(code) WHERE used_at IS NULL;

-- RLS off — как и остальные таблицы проекта (backend ходит через anon key)
ALTER TABLE registration_codes DISABLE ROW LEVEL SECURITY;
