-- 001_telegram_recovery.sql
-- Привязка Telegram + восстановление PIN через бота
-- Выполнить один раз в Supabase SQL Editor

-- 1) Колонка для chat_id привязанного телеграма
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_id
  ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- 2) Одноразовые токены привязки (используются как deep-link payload в /start)
CREATE TABLE IF NOT EXISTS telegram_binding_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_binding_tokens_user
  ON telegram_binding_tokens(user_id);

-- 3) Коды восстановления PIN (6 цифр, hash, TTL 10 мин, одноразовые)
CREATE TABLE IF NOT EXISTS pin_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pin_recovery_codes_user_active
  ON pin_recovery_codes(user_id) WHERE used_at IS NULL;

-- 4) Сессии регистрации через Telegram (заводятся ботом после share_contact)
CREATE TABLE IF NOT EXISTS registration_sessions (
  token TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_registration_sessions_phone
  ON registration_sessions(phone) WHERE used_at IS NULL;

-- 5) Отключаем RLS на новых таблицах — backend ходит через anon key, как и для остальных таблиц проекта
ALTER TABLE pin_recovery_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_binding_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE registration_sessions DISABLE ROW LEVEL SECURITY;
