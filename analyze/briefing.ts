/**
 * Briefing Generator — synthesizes multiple sources into a single briefing document
 * Uses Ollama Qwen 2.5-coder:32b for local generation
 */

import { generate, isAvailable } from "./ollama.js";

export interface SourceSummary {
  id: string;
  title: string;
  author: string;
  url: string;
  transcript: string;
  sourceType: string;
}

export interface Briefing {
  topic: string;
  markdown: string;
  questions: string[];
  sourceCount: number;
}

/**
 * Generate a synthesized briefing from multiple source transcripts
 */
export async function generateBriefing(
  topic: string,
  sources: SourceSummary[]
): Promise<Briefing> {
  if (!(await isAvailable())) {
    throw new Error(
      "Ollama is not running. Start it with: ollama serve"
    );
  }

  // Build source context — truncate long transcripts to fit context window
  const maxPerSource = Math.floor(12000 / sources.length);
  const sourceContext = sources
    .map(
      (s, i) =>
        `### Source ${i + 1}: "${s.title}" by ${s.author}
Type: ${s.sourceType} | URL: ${s.url}

${s.transcript.slice(0, maxPerSource)}${s.transcript.length > maxPerSource ? "\n[...truncated...]" : ""}`
    )
    .join("\n\n---\n\n");

  const prompt = `You are synthesizing ${sources.length} sources on the topic "${topic}" for a content creator building a health technology app called GIStudio.

## Source Material

${sourceContext}

## Your Task

Create a comprehensive briefing document with these sections:

### 1. Source Summaries
For each source, provide a 2-3 sentence summary of its key points.

### 2. Points of Agreement
What do these sources agree on? What themes recur?

### 3. Points of Tension
Where do sources disagree, or offer meaningfully different perspectives?

### 4. Key Insights
Extract the 5 most important insights, with citations to specific sources.
Format: "**Insight**: [description] — Source: [title by author]"

### 5. Interview Questions
Generate 7 questions that the GIStudio Operator could explore in an interview about this topic. Questions should:
- Follow a progression from accessible to deep (Terry Gross chapter ordering)
- Include at least one "expectation vs experience" question (Ira Glass technique)
- Include at least one question that connects this topic to building a health app
- Be genuinely curious, not rhetorical

### 6. GIStudio Connection
In 2-3 sentences, explain how this topic connects to building GIStudio specifically.

Format the entire output as clean markdown.`;

  console.log(
    `Generating briefing for "${topic}" from ${sources.length} sources...`
  );
  console.log("Using Ollama Qwen 2.5-coder:32b (this may take 1-3 minutes)...");

  const markdown = await generate(prompt, {
    system:
      "You are an expert research synthesizer. You create clear, well-structured briefing documents that highlight agreement, tension, and actionable insights across multiple sources. Always cite your sources by name.",
    temperature: 0.6,
  });

  // Extract questions from the generated markdown
  const questions = extractQuestions(markdown);

  return {
    topic,
    markdown,
    questions,
    sourceCount: sources.length,
  };
}

/**
 * Extract interview questions from generated briefing markdown
 */
function extractQuestions(markdown: string): string[] {
  const questions: string[] = [];
  const lines = markdown.split("\n");

  let inQuestionsSection = false;

  for (const line of lines) {
    if (
      line.toLowerCase().includes("interview questions") ||
      line.toLowerCase().includes("### 5")
    ) {
      inQuestionsSection = true;
      continue;
    }

    if (inQuestionsSection && line.startsWith("###")) {
      break; // Hit next section
    }

    if (inQuestionsSection) {
      const trimmed = line.replace(/^[-*\d.)\s]+/, "").trim();
      if (trimmed && trimmed.includes("?")) {
        questions.push(trimmed);
      }
    }
  }

  return questions;
}
