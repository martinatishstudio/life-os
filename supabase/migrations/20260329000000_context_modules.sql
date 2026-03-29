-- Context modules: structured coach context
create table context_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  slug text not null,
  title text not null,
  description text not null,
  icon text not null,
  sort_order integer not null,
  update_frequency text not null,
  created_at timestamptz default now(),
  unique(user_id, slug)
);

create table context_module_fields (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references context_modules not null,
  slug text not null,
  label text not null,
  field_type text not null,
  options jsonb,
  sort_order integer not null,
  unique(module_id, slug)
);

create table context_snapshots (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references context_modules not null,
  values jsonb not null,
  created_at timestamptz default now()
);

-- RLS policies
alter table context_modules enable row level security;
alter table context_module_fields enable row level security;
alter table context_snapshots enable row level security;

create policy "Users can view own modules" on context_modules for select using (auth.uid() = user_id);
create policy "Users can insert own modules" on context_modules for insert with check (auth.uid() = user_id);
create policy "Users can update own modules" on context_modules for update using (auth.uid() = user_id);

create policy "Users can view fields of own modules" on context_module_fields for select using (
  module_id in (select id from context_modules where user_id = auth.uid())
);

create policy "Users can insert fields for own modules" on context_module_fields for insert with check (
  module_id in (select id from context_modules where user_id = auth.uid())
);

create policy "Users can view snapshots of own modules" on context_snapshots for select using (
  module_id in (select id from context_modules where user_id = auth.uid())
);

create policy "Users can insert snapshots for own modules" on context_snapshots for insert with check (
  module_id in (select id from context_modules where user_id = auth.uid())
);
