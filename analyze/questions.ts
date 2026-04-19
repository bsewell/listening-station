/**
 * Interview Question Generator
 * Generates questions following the composite interview style
 */

import { generate, isAvailable } from "./ollama.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dirname, "..");

/**
 * Generate interview questions from a briefing
 */
export async function generateQuestions(
  topic: string,
  briefing: string,
  sourceCount: number
): Promise<string[]> {
  if (!(await isAvailable())) {
    throw new Error("Ollama is not running");
  }

  // Load the style guide for technique references
  const styleGuide = await readFile(
    join(PROJECT_ROOT, "interviewer-lab", "style-guide.md"),
    "utf-8"
  );

  const prompt = `Based on the following briefing about "${topic}" (synthesized from ${sourceCount} sources), generate 8-10 interview questions.

## Briefing
${briefing.slice(0, 6000)}

## Interview Style Requirements (from style guide)
${styleGuide.slice(0, 3000)}

## Question Guidelines

Follow this progression (Terry Gross chapter ordering):
1. **Opening** (1-2 questions): Accessible, inviting, lets the audience settle in
2. **Context** (2-3 questions): Build understanding of the landscape
3. **Deep Dive** (2-3 questions): Push into surprising or complex territory
4. **Connection** (1-2 questions): How does this relate to building a health app with AI?
5. **Forward Look** (1 question): What does this change? What comes next?

Include at least:
- One "What did you expect vs what actually happened?" question (Ira Glass)
- One "You mentioned X — what do you mean by that?" follow-up (Terry Gross)
- One question that starts with a historical or contextual analogy (Maddow)
- One "I don't fully understand this yet" honest question (Radiolab co-discovery)

Output ONLY the questions, numbered 1-10, one per line. No other text.`;

  const response = await generate(prompt, {
    system:
      "You are an expert interview question writer. Generate curious, well-ordered questions that follow the specified progression and techniques.",
    temperature: 0.7,
  });

  // Parse numbered questions
  const questions = response
    .split("\n")
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter((line) => line.length > 10 && line.includes("?"));

  return questions;
}
