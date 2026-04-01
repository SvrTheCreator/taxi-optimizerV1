-- Taxi Optimizer v2 — схема БД
-- Выполняется один раз в Supabase SQL Editor

-- Пользователи (работники и админ)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,          -- '79996958294'
  name TEXT NOT NULL,
  home_address TEXT,                    -- 'ул. Стачки 188/3'
  home_lat DOUBLE PRECISION,
  home_lon DOUBLE PRECISION,
  home_updated TIMESTAMPTZ,            -- когда последний раз менял адрес
  role TEXT NOT NULL DEFAULT 'worker',  -- 'worker' | 'admin'
  pin_hash TEXT NOT NULL,              -- bcrypt хэш 4-значного ПИНа
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Заявки на смену адреса (работник подаёт → админ утверждает/отклоняет)
CREATE TABLE address_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_address TEXT NOT NULL,
  new_lat DOUBLE PRECISION,
  new_lon DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  admin_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Записи на смены
CREATE TABLE shift_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,            -- '2026-04-02'
  shift_time TEXT NOT NULL,            -- '20:00'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, shift_date, shift_time)
);

-- Кэш геокодирования (чтобы не тратить API-квоту)
CREATE TABLE geocode_cache (
  address TEXT PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  use_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы для быстрых запросов
CREATE INDEX idx_shift_entries_date ON shift_entries(shift_date);
CREATE INDEX idx_address_requests_status ON address_requests(status);
