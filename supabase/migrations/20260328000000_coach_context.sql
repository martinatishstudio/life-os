create table coach_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  context_text text not null,
  updated_at timestamptz default now()
);

alter table coach_context enable row level security;

create policy "Users can read own context" on coach_context for select using (auth.uid() = user_id);
create policy "Users can update own context" on coach_context for update using (auth.uid() = user_id);
create policy "Users can insert own context" on coach_context for insert with check (auth.uid() = user_id);
