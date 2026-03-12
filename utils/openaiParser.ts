/**
 * OpenAI parser — removed. The current gpt-4o-mini model does not support
 * direct PDF file uploads. All parsing now goes through Gemini (geminiParser.ts).
 */
import type { ParseResult } from './parsers';

export const hasOpenAI = false;

export async function parseWithOpenAI(
  _uri: string,
  _fileName: string,
): Promise<ParseResult> {
  throw new Error('OpenAI parser non disponibile. Usa Gemini.');
}
