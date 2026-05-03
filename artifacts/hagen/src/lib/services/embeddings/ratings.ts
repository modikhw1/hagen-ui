/**
 * Embedding Service for Ratings
 * 
 * Generates embeddings from notes + extracted criteria
 * Used for similarity search and RAG-based predictions
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface EmbeddingInput {
  notes: string;
  extractedCriteria?: Record<string, unknown>;
  overallScore?: number;
  tags?: string[];
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  tokens_used: number;
}

/**
 * Generate embedding for a rating's reasoning
 * Combines notes, criteria, and score into a rich text representation
 */
export async function generateRatingEmbedding(
  input: EmbeddingInput
): Promise<EmbeddingResult> {
  // Build rich text representation
  const textParts: string[] = [];
  
  // Add the notes (primary signal)
  textParts.push(`Notes: ${input.notes}`);
  
  // Add score context
  if (input.overallScore !== undefined) {
    const scoreDesc = input.overallScore >= 0.8 ? 'highly rated' :
                     input.overallScore >= 0.6 ? 'moderately rated' :
                     input.overallScore >= 0.4 ? 'mixed rating' : 'low rated';
    textParts.push(`Rating: ${scoreDesc} (${input.overallScore})`);
  }
  
  // Add extracted criteria as structured text
  if (input.extractedCriteria && Object.keys(input.extractedCriteria).length > 0) {
    const criteriaStrings = Object.entries(input.extractedCriteria)
      .filter(([_, v]) => v !== null && v !== undefined)
      .map(([k, v]) => {
        if (typeof v === 'number') {
          const level = v >= 0.7 ? 'high' : v >= 0.4 ? 'medium' : 'low';
          return `${k}: ${level} (${v.toFixed(2)})`;
        }
        return `${k}: ${v}`;
      });
    
    if (criteriaStrings.length > 0) {
      textParts.push(`Criteria: ${criteriaStrings.join(', ')}`);
    }
  }
  
  // Add tags
  if (input.tags && input.tags.length > 0) {
    textParts.push(`Tags: ${input.tags.join(', ')}`);
  }
  
  const combinedText = textParts.join('\n');
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: combinedText,
    dimensions: 1536,  // Match our vector column
  });
  
  return {
    embedding: response.data[0].embedding,
    model: 'text-embedding-3-small',
    dimensions: 1536,
    tokens_used: response.usage?.total_tokens || 0,
  };
}

/**
 * Generate embeddings for multiple ratings (batch)
 */
export async function batchGenerateEmbeddings(
  inputs: EmbeddingInput[]
): Promise<EmbeddingResult[]> {
  // Build all text representations
  const texts = inputs.map(input => {
    const parts: string[] = [`Notes: ${input.notes}`];
    
    if (input.overallScore !== undefined) {
      parts.push(`Rating: ${input.overallScore}`);
    }
    
    if (input.extractedCriteria) {
      const criteriaStr = Object.entries(input.extractedCriteria)
        .filter(([_, v]) => v !== null)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      if (criteriaStr) {
        parts.push(`Criteria: ${criteriaStr}`);
      }
    }
    
    return parts.join('\n');
  });
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    dimensions: 1536,
  });
  
  return response.data.map((d, i) => ({
    embedding: d.embedding,
    model: 'text-embedding-3-small',
    dimensions: 1536,
    tokens_used: Math.floor((response.usage?.total_tokens || 0) / texts.length),
  }));
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate embedding for a query (for similarity search)
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  });
  
  return response.data[0].embedding;
}
