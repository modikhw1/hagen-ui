/**
 * Shared v7.B tuned humor model helper.
 *
 * Extracted from analyze/route.ts so it can be reused by
 * POST /api/studio/concepts/humor-enrich without circular imports.
 */

import fs from 'fs'
import path from 'path'

const DATASET_DIR = path.join(process.cwd(), 'datasets/fine-tuning')
const MODEL_VERSIONS_FILE = path.join(DATASET_DIR, 'model_versions.json')
const TUNED_MODEL_FILE = path.join(DATASET_DIR, 'tuned_model.json')

export const HUMOR_TUNING_VERSION = 'v7.B'

export function getModelResource(version: string): { resourceName: string; versionUsed: string } | null {
  try {
    if (fs.existsSync(MODEL_VERSIONS_FILE)) {
      const versions = JSON.parse(fs.readFileSync(MODEL_VERSIONS_FILE, 'utf-8')) as {
        versions?: Record<string, { endpoint?: string; model?: string }>
        default?: string
        latest?: string
      }
      const targetVersion = version || versions.default || versions.latest
      const modelInfo = targetVersion ? versions.versions?.[targetVersion] : undefined
      if (modelInfo?.endpoint || modelInfo?.model) {
        return {
          resourceName: (modelInfo.endpoint ?? modelInfo.model) as string,
          versionUsed: targetVersion as string,
        }
      }
    }
    if (fs.existsSync(TUNED_MODEL_FILE)) {
      const modelInfo = JSON.parse(fs.readFileSync(TUNED_MODEL_FILE, 'utf-8')) as {
        endpoint?: string
        model?: string
      }
      return {
        resourceName: (modelInfo.endpoint ?? modelInfo.model) as string,
        versionUsed: 'legacy',
      }
    }
  } catch (err) {
    console.warn('[humor-model] Could not read model_versions.json:', err instanceof Error ? err.message : String(err))
  }
  return null
}

export interface TunedHumorResult {
  handlingSummary: string
  mechanism: string
  whyItWorks: string
  rawText: string
  versionUsed: string
}

function parseTunedResponse(text: string): Omit<TunedHumorResult, 'rawText' | 'versionUsed'> {
  const extract = (label: string): string => {
    const re = new RegExp(`\\*{0,2}${label}:\\*{0,2}\\s*(.+?)(?=\\n\\*{0,2}[A-ZÅÄÖ]|$)`, 'si')
    const m = text.match(re)
    return m ? m[1].trim().replace(/\*+/g, '').trim() : ''
  }
  return {
    handlingSummary: extract('Handling'),
    mechanism: extract('Mekanism'),
    whyItWorks: extract('Varför'),
  }
}

export async function runTunedHumorModel(gcsUri: string): Promise<TunedHumorResult | null> {
  const modelRes = getModelResource(HUMOR_TUNING_VERSION)
  if (!modelRes) {
    console.warn('[humor-model] v7.B model resource not found in model_versions.json — skipping')
    return null
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleAuth } = require('google-auth-library') as {
      GoogleAuth: new (opts: { scopes: string[] }) => {
        getClient(): Promise<{
          getAccessToken(): Promise<{ token: string | null | undefined }>
        }>
      }
    }
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    if (!token) {
      console.warn('[humor-model] v7.B: could not obtain access token')
      return null
    }

    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${modelRes.resourceName}:generateContent`

    const prompt = `Analysera videon kort och koncist.

Format:
**Handling:** [En mening om vad som sker]
**Mekanism:** [Nyckelord: t.ex. Subversion, Igenkänning]
**Varför:** [En mening om poängen]

Håll det extremt kort. Inget fluff.`

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { mimeType: 'video/mp4', fileUri: gcsUri } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!resp.ok) {
      console.warn(`[humor-model] v7.B (${modelRes.versionUsed}) call failed:`, resp.status)
      return null
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null

    const parsed = parseTunedResponse(text)
    return { ...parsed, rawText: text.trim(), versionUsed: modelRes.versionUsed }
  } catch (err) {
    console.warn(
      '[humor-model] v7.B call failed:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
