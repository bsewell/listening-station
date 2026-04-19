/**
 * GitHub Pages Blog Publisher
 *
 * Generates static HTML pages from episode markdown and commits
 * to the content/ directory for GitHub Pages serving.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(PROJECT_ROOT, "content");
const EPISODES_DIR = join(CONTENT_DIR, "episodes");

interface EpisodeManifest {
  slug: string;
  title: string;
  episodeNumber: number;
  publishedAt: string;
  blogPath: string;
}

/**
 * Generate the blog index page from all published episodes
 */
export async function generateIndex(): Promise<string> {
  const indexPath = join(CONTENT_DIR, "index.json");
  const indexData = existsSync(indexPath)
    ? JSON.parse(await readFile(indexPath, "utf-8"))
    : { episodes: [] };

  // Scan for episodes on disk
  if (!existsSync(EPISODES_DIR)) return indexPath;

  const dirs = await readdir(EPISODES_DIR, { withFileTypes: true });
  const episodes: EpisodeManifest[] = [];

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const blogPath = join(EPISODES_DIR, dir.name, "blog.md");
    const sourcesPath = join(EPISODES_DIR, dir.name, "sources.json");

    if (!existsSync(blogPath)) continue;

    const blogContent = await readFile(blogPath, "utf-8");
    const titleMatch = blogContent.match(/^#\s+(.+)/m);
    const title = titleMatch?.[1] || dir.name;

    // Extract episode number from slug (e.g., "2026-04-18-claude" → look up)
    const numMatch = dir.name.match(/^(\d{4}-\d{2}-\d{2})/);
    const publishedAt = numMatch?.[1] || new Date().toISOString().slice(0, 10);

    episodes.push({
      slug: dir.name,
      title,
      episodeNumber: episodes.length + 1,
      publishedAt,
      blogPath: `episodes/${dir.name}/blog.md`,
    });
  }

  // Sort by date descending
  episodes.sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt)
  );

  indexData.episodes = episodes;
  await writeFile(indexPath, JSON.stringify(indexData, null, 2));

  // Generate index.html
  const html = generateIndexHtml(episodes);
  await writeFile(join(CONTENT_DIR, "index.html"), html);

  return indexPath;
}

/**
 * Generate an HTML page for a single episode blog post
 */
export async function generateEpisodePage(
  slug: string
): Promise<string | null> {
  const blogPath = join(EPISODES_DIR, slug, "blog.md");
  if (!existsSync(blogPath)) return null;

  const markdown = await readFile(blogPath, "utf-8");
  const htmlPath = join(EPISODES_DIR, slug, "index.html");

  const html = generateEpisodeHtml(slug, markdown);
  await writeFile(htmlPath, html);

  return htmlPath;
}

/**
 * Generate all episode pages and the index
 */
export async function generateAll(): Promise<{
  index: string;
  pages: string[];
}> {
  const index = await generateIndex();

  const dirs = await readdir(EPISODES_DIR, { withFileTypes: true });
  const pages: string[] = [];

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const page = await generateEpisodePage(dir.name);
    if (page) pages.push(page);
  }

  return { index, pages };
}

function generateIndexHtml(episodes: EpisodeManifest[]): string {
  const episodeList = episodes
    .map(
      (ep) => `
      <article class="episode">
        <time>${ep.publishedAt}</time>
        <h2><a href="episodes/${ep.slug}/">${ep.title}</a></h2>
      </article>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Listening Station — GIStudio</title>
  <style>
    :root { --bg: #0a0a0a; --fg: #e5e5e5; --muted: #888; --accent: #60a5fa; }
    body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--fg); max-width: 640px; margin: 0 auto; padding: 2rem 1rem; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--muted); margin-bottom: 2rem; }
    .episode { margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #222; }
    .episode time { font-size: 0.8rem; color: var(--muted); }
    .episode h2 { font-size: 1.1rem; margin: 0.25rem 0 0; }
    .episode a { color: var(--accent); text-decoration: none; }
    .episode a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Listening Station</h1>
  <p class="subtitle">Documenting the GIStudio journey — what we're learning, building, and discovering.</p>
  ${episodeList || '<p style="color:var(--muted)">No episodes published yet.</p>'}
</body>
</html>`;
}

function generateEpisodeHtml(slug: string, markdown: string): string {
  // Simple markdown-to-html for headings, paragraphs, bold, italic, links
  let html = markdown
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hp])(.+)$/gm, "$1");

  html = `<p>${html}</p>`;

  // Extract title from first heading
  const titleMatch = markdown.match(/^#\s+(.+)/m);
  const title = titleMatch?.[1] || slug;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Listening Station</title>
  <style>
    :root { --bg: #0a0a0a; --fg: #e5e5e5; --muted: #888; --accent: #60a5fa; }
    body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--fg); max-width: 640px; margin: 0 auto; padding: 2rem 1rem; line-height: 1.7; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.2rem; color: var(--accent); margin-top: 2rem; }
    h3 { font-size: 1rem; margin-top: 1.5rem; }
    a { color: var(--accent); }
    .back { font-size: 0.85rem; color: var(--muted); text-decoration: none; display: inline-block; margin-bottom: 1rem; }
    .back:hover { color: var(--fg); }
    blockquote { border-left: 3px solid var(--accent); margin: 1rem 0; padding: 0.5rem 1rem; color: var(--muted); }
  </style>
</head>
<body>
  <a href="../../" class="back">&larr; All episodes</a>
  ${html}
</body>
</html>`;
}
