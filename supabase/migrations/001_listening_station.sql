-- Listening Station schema
-- Added to existing GIStudio Supabase project

-- Sources: every URL ingested into the system
create table if not exists listening_station_sources (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  source_type text not null check (source_type in ('youtube', 'podcast', 'article')),
  title text,
  author text,
  published_at timestamptz,
  metadata jsonb default '{}',
  transcript text,
  transcript_method text check (transcript_method in ('whisper', 'existing', 'scrape')),
  status text default 'pending' check (status in ('pending', 'transcribing', 'ready', 'error')),
  error_message text,
  topic_tags text[] default '{}',
  duration_seconds int,
  word_count int,
  lightrag_doc_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Topic clusters: groups of related sources
create table if not exists listening_station_clusters (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  description text,
  source_ids uuid[] not null default '{}',
  briefing text,
  interview_questions jsonb default '[]',
  status text default 'draft' check (status in ('draft', 'briefed', 'interviewed', 'published')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Episodes: produced content ready for distribution
create table if not exists listening_station_episodes (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid references listening_station_clusters(id),
  slug text not null unique,
  title text not null,
  episode_number int,
  interview_md text,
  blog_md text,
  social_clips jsonb default '[]',
  newsletter_md text,
  audio_script text,
  status text default 'draft' check (status in ('draft', 'review', 'published')),
  published_at timestamptz,
  distribution jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Interviewer profiles: technique tracking from real interviewers
create table if not exists listening_station_interviewers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  show text,
  role text check (role in ('interviewer', 'storyteller')),
  techniques jsonb not null default '[]',
  example_count int default 0,
  style_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at timestamps
create or replace function listening_station_update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger listening_station_sources_updated
  before update on listening_station_sources
  for each row execute function listening_station_update_timestamp();

create trigger listening_station_clusters_updated
  before update on listening_station_clusters
  for each row execute function listening_station_update_timestamp();

create trigger listening_station_episodes_updated
  before update on listening_station_episodes
  for each row execute function listening_station_update_timestamp();

create trigger listening_station_interviewers_updated
  before update on listening_station_interviewers
  for each row execute function listening_station_update_timestamp();

-- Indexes
create index idx_ls_sources_status on listening_station_sources(status);
create index idx_ls_sources_type on listening_station_sources(source_type);
create index idx_ls_sources_tags on listening_station_sources using gin(topic_tags);
create index idx_ls_clusters_status on listening_station_clusters(status);
create index idx_ls_episodes_status on listening_station_episodes(status);
create index idx_ls_episodes_slug on listening_station_episodes(slug);

-- RLS policies (enable for all tables)
alter table listening_station_sources enable row level security;
alter table listening_station_clusters enable row level security;
alter table listening_station_episodes enable row level security;
alter table listening_station_interviewers enable row level security;

-- For now, allow all authenticated access (single-user app)
create policy "Allow all access to listening_station_sources"
  on listening_station_sources for all
  using (true) with check (true);

create policy "Allow all access to listening_station_clusters"
  on listening_station_clusters for all
  using (true) with check (true);

create policy "Allow all access to listening_station_episodes"
  on listening_station_episodes for all
  using (true) with check (true);

create policy "Allow all access to listening_station_interviewers"
  on listening_station_interviewers for all
  using (true) with check (true);
