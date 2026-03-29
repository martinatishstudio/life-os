# Life OS - Martin Jakobsen

## What is this?

A personal life operating system. A Next.js web app that serves as a single source of truth for vision, goals, habits, finances, and accountability. Claude API powers the intelligence layer (daily briefs, weekly reviews, goal breakdowns).

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Row Level Security)
- **Styling**: Tailwind CSS
- **AI**: Claude API (Anthropic SDK)
- **Hosting**: Vercel
- **Language**: TypeScript

## Project Structure

```
life-os/
├── CLAUDE.md                    # This file
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout with nav
│   │   ├── page.tsx             # Dashboard (overview)
│   │   ├── vision/page.tsx      # 10-year vision + timeline
│   │   ├── goals/page.tsx       # Goals + milestones by category
│   │   ├── daily/page.tsx       # Daily habits + priorities
│   │   ├── finance/page.tsx     # Financial tracking + analysis
│   │   ├── review/page.tsx      # Weekly/monthly review with Claude
│   │   └── api/
│   │       ├── claude/route.ts  # Claude API proxy
│   │       └── finance/route.ts # Finance import endpoint
│   ├── components/
│   │   ├── ui/                  # Reusable UI components
│   │   ├── dashboard/           # Dashboard-specific components
│   │   ├── goals/               # Goal cards, progress bars
│   │   ├── habits/              # Habit checklist, streaks
│   │   └── finance/             # Charts, spending breakdown
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client
│   │   ├── claude.ts            # Claude API helper
│   │   └── utils.ts             # Shared utilities
│   └── types/
│       └── index.ts             # TypeScript types
├── supabase/
│   └── migrations/              # Database migrations
└── seed/
    └── seed.sql                 # Initial data (vision, categories, goals)
```

## Database Schema

### Categories
The system organizes everything into life categories:
- `business` - Selskaper, karriere, PE-virksomhet
- `physical` - Trening, helse, kropp
- `mental` - Psykisk helse, mindset, personlig vekst
- `finance` - Økonomi, investeringer, formue
- `family` - Familie, kjæreste, barn
- `lifestyle` - Reiser, opplevelser, frihet
- `brand` - Personlig merkevare, foredrag, sosiale medier

### Tables

```sql
-- Vision: The 10-year north star
create table vision (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  description text not null,
  target_year integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Vision categories: Broken down by life area
create table vision_categories (
  id uuid primary key default gen_random_uuid(),
  vision_id uuid references vision not null,
  category text not null,
  description text not null,
  target_state text not null -- What success looks like
);

-- Goals: Concrete targets with deadlines
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null,
  title text not null,
  description text,
  target_value numeric,
  current_value numeric default 0,
  unit text, -- 'kr', '%', 'kg', 'count', etc.
  deadline date,
  status text default 'active', -- active, completed, paused, abandoned
  parent_goal_id uuid references goals, -- For sub-goals
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Milestones: Steps toward goals
create table milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals not null,
  title text not null,
  description text,
  target_date date,
  completed boolean default false,
  completed_at timestamptz,
  sort_order integer default 0
);

-- Habits: Daily/weekly recurring actions
create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null,
  title text not null,
  frequency text not null, -- 'daily', 'weekly', 'weekdays'
  target_count integer default 1, -- e.g. 3 for "3x per week"
  time_of_day text, -- 'morning', 'evening', 'anytime'
  active boolean default true,
  created_at timestamptz default now()
);

-- Habit completions: Track each check-off
create table habit_completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references habits not null,
  completed_date date not null,
  notes text,
  created_at timestamptz default now(),
  unique(habit_id, completed_date)
);

-- Finance entries: Income and expenses
create table finance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  amount numeric not null, -- Positive = income, negative = expense
  category text not null, -- 'bolig', 'mat', 'transport', 'trening', etc.
  description text,
  source text, -- 'manual', 'csv_import'
  created_at timestamptz default now()
);

-- Finance targets: Monthly/yearly budgets
create table finance_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null,
  monthly_budget numeric,
  yearly_target numeric,
  target_type text not null -- 'savings', 'investment', 'expense_limit'
);

-- Daily priorities: Top 3 things for the day
create table daily_priorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  title text not null,
  category text,
  completed boolean default false,
  sort_order integer default 0
);

-- Journal entries: For reflection and Claude conversations
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  type text not null, -- 'daily_brief', 'weekly_review', 'monthly_review', 'note'
  content text not null,
  ai_response text, -- Claude's response
  created_at timestamptz default now()
);

-- Goal progress snapshots: Weekly score per category
create table progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null,
  score integer not null, -- 0-100
  week_start date not null,
  notes text,
  created_at timestamptz default now(),
  unique(user_id, category, week_start)
);
```

## Claude API Integration

### Daily Brief
When user opens the app or clicks "Daglig brief", call Claude with:
- Today's habits and completion status
- Active goals and their progress
- This week's priorities
- Recent journal entries
- Upcoming milestones

Claude should respond with a concise, motivating daily brief in Norwegian (bokmål). Direct tone, no fluff. Push accountability.

### Weekly Review
Every Sunday (or when triggered), Claude receives:
- All habit completions for the week
- Goal progress changes
- Finance summary
- Category scores

Claude provides: what went well, what needs attention, score adjustments, suggested priorities for next week.

### Goal Breakdown
When user creates a new goal or writes their vision, Claude breaks it down into milestones with dates.

### System Prompt for Claude
```
Du er Martin sitt personlige accountability-system. Du kjenner hans 10-årsvisjon, mål og daglige rutiner. Din jobb er å holde ham på sporet, være direkte og ærlig, og hjelpe ham med å prioritere det som faktisk beveger nålen mot visjonen hans.

Regler:
- Snakk norsk (bokmål), direkte og konsist
- Ikke bruk bindestreker som tegnsetting
- Vær ærlig, også når ting ikke går bra
- Fokuser alltid på: hva er det viktigste å gjøre NÅ for å komme nærmere visjonen?
- Koble daglige handlinger til langsiktige mål
- Ikke vær en cheerleader, vær en coach
```

## Design Principles

- Clean, minimal, flat design. No gradients or shadows.
- White/light backgrounds with subtle borders.
- Metric cards for KPIs.
- Progress bars for goals.
- Checkbox lists for habits.
- Charts (recharts) for trends.
- Mobile-first, works on phone and desktop.
- Color coding by category (consistent across all views):
  - Business: blue
  - Physical: teal/green
  - Mental: purple
  - Finance: amber
  - Family: pink
  - Lifestyle: coral
  - Brand: indigo

## Key UX Flows

### Morning (2 min)
1. Open app -> see dashboard with today's priorities
2. Check off morning habits
3. Read daily brief from Claude (auto-generated)

### During day
1. Check off habits and priorities as completed
2. Log expenses if relevant

### Evening (2 min)
1. Check off evening habits
2. Quick journal note (optional)
3. Set tomorrow's top 3 priorities

### Weekly review (Sunday, 10 min)
1. Go to Review page
2. Claude summarizes the week
3. Adjust scores per category
4. Set next week's focus areas

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

## Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Lint
npx supabase start   # Start local Supabase
npx supabase db push # Push migrations
```

## Important Notes

- All text content is in Norwegian (bokmål)
- Never use dashes as punctuation in any written content
- The app is for a single user (Martin) but should use Supabase Auth for security
- Mobile experience is critical, this will be used on phone daily
- Performance matters: dashboard should load fast with minimal queries
- Prefer server components where possible, client components only for interactivity
