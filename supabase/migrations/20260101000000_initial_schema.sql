-- Life OS: Initial Schema Migration

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- VISION
-- ============================================

create table if not exists vision (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  description text not null,
  target_year integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table vision enable row level security;

create policy "Users can manage own vision"
  on vision for all
  using (auth.uid() = user_id);

-- ============================================
-- VISION CATEGORIES
-- ============================================

create table if not exists vision_categories (
  id uuid primary key default gen_random_uuid(),
  vision_id uuid not null references vision on delete cascade,
  category text not null,
  description text not null,
  target_state text not null
);

alter table vision_categories enable row level security;

create policy "Users can manage own vision categories"
  on vision_categories for all
  using (
    vision_id in (
      select id from vision where user_id = auth.uid()
    )
  );

-- ============================================
-- GOALS
-- ============================================

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null,
  title text not null,
  description text,
  target_value numeric,
  current_value numeric default 0,
  unit text,
  deadline date,
  status text default 'active' check (status in ('active', 'completed', 'paused', 'abandoned')),
  parent_goal_id uuid references goals,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table goals enable row level security;

create policy "Users can manage own goals"
  on goals for all
  using (auth.uid() = user_id);

-- ============================================
-- MILESTONES
-- ============================================

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals on delete cascade,
  title text not null,
  description text,
  target_date date,
  completed boolean default false,
  completed_at timestamptz,
  sort_order integer default 0
);

alter table milestones enable row level security;

create policy "Users can manage own milestones"
  on milestones for all
  using (
    goal_id in (
      select id from goals where user_id = auth.uid()
    )
  );

-- ============================================
-- HABITS
-- ============================================

create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null,
  title text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'weekdays')),
  target_count integer default 1,
  time_of_day text check (time_of_day in ('morning', 'evening', 'anytime')),
  active boolean default true,
  created_at timestamptz default now()
);

alter table habits enable row level security;

create policy "Users can manage own habits"
  on habits for all
  using (auth.uid() = user_id);

-- ============================================
-- HABIT COMPLETIONS
-- ============================================

create table if not exists habit_completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits on delete cascade,
  completed_date date not null,
  notes text,
  created_at timestamptz default now(),
  unique(habit_id, completed_date)
);

alter table habit_completions enable row level security;

create policy "Users can manage own habit completions"
  on habit_completions for all
  using (
    habit_id in (
      select id from habits where user_id = auth.uid()
    )
  );

-- ============================================
-- FINANCE ENTRIES
-- ============================================

create table if not exists finance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  amount numeric not null,
  category text not null,
  description text,
  source text,
  created_at timestamptz default now()
);

alter table finance_entries enable row level security;

create policy "Users can manage own finance entries"
  on finance_entries for all
  using (auth.uid() = user_id);

-- ============================================
-- FINANCE TARGETS
-- ============================================

create table if not exists finance_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null,
  monthly_budget numeric,
  yearly_target numeric,
  target_type text not null check (target_type in ('savings', 'investment', 'expense_limit'))
);

alter table finance_targets enable row level security;

create policy "Users can manage own finance targets"
  on finance_targets for all
  using (auth.uid() = user_id);

-- ============================================
-- DAILY PRIORITIES
-- ============================================

create table if not exists daily_priorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  title text not null,
  category text,
  completed boolean default false,
  sort_order integer default 0
);

alter table daily_priorities enable row level security;

create policy "Users can manage own daily priorities"
  on daily_priorities for all
  using (auth.uid() = user_id);

-- ============================================
-- JOURNAL ENTRIES
-- ============================================

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  type text not null check (type in ('daily_brief', 'weekly_review', 'monthly_review', 'note')),
  content text not null,
  ai_response text,
  created_at timestamptz default now()
);

alter table journal_entries enable row level security;

create policy "Users can manage own journal entries"
  on journal_entries for all
  using (auth.uid() = user_id);

-- ============================================
-- PROGRESS SNAPSHOTS
-- ============================================

create table if not exists progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null,
  score integer not null check (score >= 0 and score <= 100),
  week_start date not null,
  notes text,
  created_at timestamptz default now(),
  unique(user_id, category, week_start)
);

alter table progress_snapshots enable row level security;

create policy "Users can manage own progress snapshots"
  on progress_snapshots for all
  using (auth.uid() = user_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger vision_updated_at
  before update on vision
  for each row execute function update_updated_at();

create trigger goals_updated_at
  before update on goals
  for each row execute function update_updated_at();
