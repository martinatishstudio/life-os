-- Coach context: Personalized system prompt stored in DB
create table if not exists coach_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  context_text text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table coach_context enable row level security;

create policy "Users can manage own coach context"
  on coach_context for all
  using (auth.uid() = user_id);

create trigger coach_context_updated_at
  before update on coach_context
  for each row execute function update_updated_at();
