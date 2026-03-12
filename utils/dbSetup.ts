
export const SQL_SETUP_SCRIPT = `
-- 0. KHẮC PHỤC LỖI CẤU TRÚC (QUAN TRỌNG)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_password_key;
DROP INDEX IF EXISTS users_password_key;

-- 1. XÓA SẠCH DỮ LIỆU CŨ (Nếu bạn muốn làm mới, hãy thận trọng)
-- TRUNCATE TABLE tasks, users, units RESTART IDENTITY CASCADE;

-- 2. Bật Extension UUID
create extension if not exists "uuid-ossp";

-- 3. Tạo bảng units
create table if not exists units (
  id uuid default uuid_generate_v4() primary key,
  code text not null unique,
  name text not null,
  parent_id uuid, 
  manager_ids text[] default '{}',
  address text,
  phone text,
  level int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Tạo bảng users
create table if not exists users (
  id uuid default uuid_generate_v4() primary key,
  hrm_code text,
  full_name text,
  email text,
  username text unique,
  password text,
  title text,
  unit_id uuid references units(id),
  is_first_login boolean default true,
  can_manage boolean default false,
  avatar text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Tạo bảng tasks
create table if not exists tasks (
  id uuid default uuid_generate_v4() primary key,
  name text,
  content text,
  type text,
  status text,
  priority text,
  progress int default 0,
  deadline timestamp with time zone,
  assigner_id uuid references users(id),
  primary_ids text[] default '{}',
  support_ids text[] default '{}',
  project_id text,
  ext_request jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 6. TẠO BẢNG kpis (DÙNG ĐỂ ĐỒNG BỘ DỮ LIỆU)
create table if not exists kpis (
  id uuid default uuid_generate_v4() primary key,
  entity_id text not null, -- HRM_CODE hoặc UNIT_CODE
  type text not null,      -- 'personal' hoặc 'group'
  targets jsonb default '{}',
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(entity_id, type) -- Ràng buộc quan trọng để dùng logic UPSERT
);

-- 7. Cấp quyền truy cập Row Level Security (RLS)
alter table units enable row level security;
create policy "Allow All Units" on units for all using (true) with check (true);

alter table users enable row level security;
create policy "Allow All Users" on users for all using (true) with check (true);

alter table tasks enable row level security;
create policy "Allow All Tasks" on tasks for all using (true) with check (true);

alter table kpis enable row level security;
create policy "Allow All KPIs" on kpis for all using (true) with check (true);

-- 8. KHỞI TẠO DỮ LIỆU GỐC (Nếu chưa có)
DO $$
DECLARE
  rootId uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM units WHERE code = 'VNPT_QN') THEN
    INSERT INTO units (code, name, level, address) 
    VALUES ('VNPT_QN', 'VNPT Quảng Ninh', 0, '20 Lê Thánh Tông') 
    RETURNING id INTO rootId;
  ELSE
    SELECT id INTO rootId FROM units WHERE code = 'VNPT_QN';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
    INSERT INTO users (hrm_code, full_name, email, username, password, title, unit_id, can_manage, is_first_login)
    VALUES ('ADMIN', 'Quản Trị Viên (System)', 'admin@vnpt.vn', 'admin', '202cb962ac59075b964b07152d234b70', 'Giám đốc', rootId, true, false);
  END IF;
END $$;
`;
