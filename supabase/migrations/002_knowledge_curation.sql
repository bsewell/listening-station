-- Knowledge curation layer: extract insights, curate, feed into content generation

-- Product process categories (user-defined taxonomy)
create table if not exists listening_station_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order int default 0,
  color text default '#6366f1',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Extracted insights from source transcripts
create table if not exists listening_station_insights (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references listening_station_sources(id) on delete cascade,
  category_id uuid references listening_station_categories(id),
  topic text not null,
  subtopic text,
  insight text not null,
  evidence text,
  relevance text,
  confidence float default 0.5,
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected', 'starred')),
  rejected_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Extraction runs (idempotency guard — one per source)
create table if not exists listening_station_extractions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references listening_station_sources(id) on delete cascade,
  insight_count int default 0,
  model text not null,
  duration_ms int,
  error text,
  created_at timestamptz default now()
);

-- Timestamps
create trigger listening_station_categories_updated
  before update on listening_station_categories
  for each row execute function listening_station_update_timestamp();

create trigger listening_station_insights_updated
  before update on listening_station_insights
  for each row execute function listening_station_update_timestamp();

-- Indexes
create index idx_ls_insights_source on listening_station_insights(source_id);
create index idx_ls_insights_category on listening_station_insights(category_id);
create index idx_ls_insights_status on listening_station_insights(status);
create index idx_ls_insights_topic on listening_station_insights(topic);
create index idx_ls_extractions_source on listening_station_extractions(source_id);

-- RLS
alter table listening_station_categories enable row level security;
alter table listening_station_insights enable row level security;
alter table listening_station_extractions enable row level security;

create policy "Allow all access to listening_station_categories"
  on listening_station_categories for all using (true) with check (true);
create policy "Allow all access to listening_station_insights"
  on listening_station_insights for all using (true) with check (true);
create policy "Allow all access to listening_station_extractions"
  on listening_station_extractions for all using (true) with check (true);

-- Seed categories
insert into listening_station_categories (name, slug, sort_order, color) values
  ('User research',     'user-research',     1, '#6366f1'),
  ('Feature design',    'feature-design',    2, '#8b5cf6'),
  ('Launch prep',       'launch-prep',       3, '#ec4899'),
  ('Analytics',         'analytics',         4, '#14b8a6'),
  ('Content marketing', 'content-marketing', 5, '#f59e0b'),
  ('Dev tooling',       'dev-tooling',       6, '#22c55e'),
  ('Growth',            'growth',            7, '#3b82f6')
on conflict (slug) do nothing;
