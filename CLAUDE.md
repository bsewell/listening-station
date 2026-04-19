# Listening Station — Claude Code Instructions

## What is this?
Content ingestion and interview-style content marketing pipeline for GIStudio. Ingests YouTube videos, podcasts, and articles → transcribes → clusters by topic → generates interview-style content using a hybrid style learned from master interviewers → distributes to multiple channels.

## Architecture
- **Ingest**: YouTube (yt-dlp), Podcasts (RSS), Articles (readability scrape)
- **Analyze**: Whisper transcription, LightRAG semantic indexing, topic clustering, briefing synthesis
- **Interviewer Lab**: Style profiles learned from real interviewers (Ira Glass, Terry Gross, Maddow, Radiolab, Planet Money)
- **Produce**: Multi-format output (blog, social clips, newsletter, audio script)
- **Distribute**: GitHub repo, GitHub Pages, social media via n8n webhooks

## Key Dependencies
- **Meeting Transcriber MCP**: `/Users/bsewell/000-HOME/05-INFRASTRUCTURE/tools/meeting-mcp/` — Whisper transcription
- **LightRAG**: Docker container on port 9621 — semantic search and knowledge graph
- **Ollama (Qwen)**: qwen2.5-coder:32b — local LLM for briefings, technique extraction
- **n8n**: Docker container on port 5678 — distribution webhooks
- **Supabase**: Shared with GIStudio — `listening_station_*` tables
- **Claude API**: Interview generation via @anthropic-ai/sdk

## Database
Uses the existing GIStudio Supabase project. All tables are prefixed `listening_station_` to avoid collisions:
- `listening_station_sources` — ingested URLs and transcripts
- `listening_station_clusters` — topic groups with briefings
- `listening_station_episodes` — produced content
- `listening_station_interviewers` — technique profiles
- `listening_station_categories` — product process taxonomy (user research, feature design, etc.)
- `listening_station_insights` — extracted actionable insights with accept/reject curation
- `listening_station_extractions` — idempotency guard for extraction runs

## How we work
1. TypeScript project — use `tsx` for running scripts
2. All transcription runs locally via Whisper (privacy-first)
3. Interview generation uses Claude API (content is public marketing, not health data)
4. Generated content is committed to `content/episodes/` and published
5. Interviewer Lab is a living system — ingest more examples to improve the style

## CLI Commands
```bash
npx tsx scripts/ingest.ts <url>              # Ingest a URL
npx tsx scripts/cluster.ts <topic>           # Cluster sources by topic
npx tsx scripts/extract-insights.ts          # Extract insights from all ready sources
npx tsx scripts/extract-insights.ts <id>     # Extract from one source
npx tsx scripts/interview.ts <cluster_id>    # Generate interview from cluster
npx tsx scripts/publish.ts <episode_id>      # Distribute published episode
```

## Knowledge Base
The knowledge curation layer extracts actionable insights from source transcripts via Ollama, then lets you accept/reject/star them through the web dashboard at `/knowledge`. Curated insights (accepted + starred) are automatically injected into interview generation as storytelling anchors. Starred insights are high-priority and must appear in the output.
