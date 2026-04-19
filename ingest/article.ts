import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface ArticleMetadata {
  title: string;
  author: string;
  publishedAt: string;
  siteName: string;
  excerpt: string;
  url: string;
}

export interface ArticleIngestResult {
  metadata: ArticleMetadata;
  content: string;
  wordCount: number;
}

/**
 * Fetch and parse an article URL using Readability
 */
export async function ingestArticle(url: string): Promise<ArticleIngestResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Could not parse article content — Readability returned null");
  }

  // Clean the text content (strip remaining HTML from textContent)
  const content = article.textContent
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const wordCount = content.split(/\s+/).length;

  // Try to extract publish date from meta tags
  const publishedAt = extractPublishDate(html) || new Date().toISOString();

  return {
    metadata: {
      title: article.title || "Untitled",
      author: article.byline || extractAuthor(html) || "Unknown",
      publishedAt,
      siteName: article.siteName || new URL(url).hostname,
      excerpt: article.excerpt || content.slice(0, 200),
      url,
    },
    content,
    wordCount,
  };
}

/**
 * Extract publish date from HTML meta tags
 */
function extractPublishDate(html: string): string | null {
  const patterns = [
    /property="article:published_time"\s+content="([^"]+)"/i,
    /name="publication_date"\s+content="([^"]+)"/i,
    /name="date"\s+content="([^"]+)"/i,
    /property="og:published_time"\s+content="([^"]+)"/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        return new Date(match[1]).toISOString();
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Extract author from HTML meta tags
 */
function extractAuthor(html: string): string | null {
  const patterns = [
    /name="author"\s+content="([^"]+)"/i,
    /property="article:author"\s+content="([^"]+)"/i,
    /"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i,
    /"author"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }

  return null;
}
