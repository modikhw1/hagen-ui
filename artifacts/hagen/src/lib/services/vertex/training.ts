/**
 * Vertex AI Fine-Tuning Service
 * 
 * Handles supervised fine-tuning of Gemini 2.5 models using video data
 * Based on Google's best practices for video tuning
 */

import { Storage } from '@google-cloud/storage';

// Types for Vertex AI tuning
export interface TuningConfig {
  projectId: string;
  location: string;
  bucketName: string;
  baseModel: string;
}

export interface TuningJobConfig {
  displayName: string;
  trainingDataUri: string;
  validationDataUri?: string;
  epochs?: number;
  learningRateMultiplier?: number;
  adapterSize?: number;
}

export interface TuningJob {
  name: string;
  displayName: string;
  state: 'JOB_STATE_PENDING' | 'JOB_STATE_RUNNING' | 'JOB_STATE_SUCCEEDED' | 'JOB_STATE_FAILED' | 'JOB_STATE_CANCELLED';
  createTime: string;
  updateTime: string;
  tunedModelEndpoint?: string;
  error?: string;
}

export interface TrainingDataset {
  videoId: string;
  gcsUri: string;
  overallScore: number;
  dimensions: Record<string, number>;
  notes?: string;
}

export class VertexTuningService {
  private projectId: string;
  private location: string;
  private bucketName: string;
  private baseModel: string;
  private storage: Storage;
  private apiEndpoint: string;

  constructor(config?: Partial<TuningConfig>) {
    this.projectId = config?.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID!;
    this.location = config?.location || process.env.VERTEX_LOCATION || 'us-central1';
    this.bucketName = config?.bucketName || process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'hagen-video-analysis';
    this.baseModel = config?.baseModel || 'gemini-2.5-flash-preview-05-20';
    
    this.storage = new Storage({ projectId: this.projectId });
    this.apiEndpoint = `https://${this.location}-aiplatform.googleapis.com/v1`;
  }

  /**
   * Prepare training data by uploading JSONL to GCS
   */
  async prepareTrainingData(
    datasets: TrainingDataset[],
    trainSplit: number = 0.8
  ): Promise<{ trainUri: string; validationUri: string }> {
    // Shuffle datasets
    const shuffled = [...datasets].sort(() => Math.random() - 0.5);
    
    // Split into train and validation
    const splitIndex = Math.floor(shuffled.length * trainSplit);
    const trainData = shuffled.slice(0, splitIndex);
    const validationData = shuffled.slice(splitIndex);

    console.log(`📊 Preparing training data: ${trainData.length} train, ${validationData.length} validation`);

    // Convert to Vertex AI JSONL format
    const trainJsonl = trainData.map(d => this.formatTrainingExample(d)).join('\n');
    const validationJsonl = validationData.map(d => this.formatTrainingExample(d)).join('\n');

    // Upload to GCS
    const timestamp = Date.now();
    const trainPath = `training/train_${timestamp}.jsonl`;
    const validationPath = `training/validation_${timestamp}.jsonl`;

    const bucket = this.storage.bucket(this.bucketName);

    await bucket.file(trainPath).save(trainJsonl, {
      contentType: 'application/jsonl',
      metadata: {
        recordCount: trainData.length.toString(),
        createdAt: new Date().toISOString()
      }
    });

    await bucket.file(validationPath).save(validationJsonl, {
      contentType: 'application/jsonl',
      metadata: {
        recordCount: validationData.length.toString(),
        createdAt: new Date().toISOString()
      }
    });

    const trainUri = `gs://${this.bucketName}/${trainPath}`;
    const validationUri = `gs://${this.bucketName}/${validationPath}`;

    console.log(`✅ Training data uploaded to GCS`);
    console.log(`   Train: ${trainUri}`);
    console.log(`   Validation: ${validationUri}`);

    return { trainUri, validationUri };
  }

  /**
   * Format a single training example for Vertex AI
   */
  private formatTrainingExample(dataset: TrainingDataset): string {
    const example = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Rate this video for content quality and engagement potential. Analyze the hook, pacing, originality, payoff, and rewatchability. Provide scores from 0 to 1."
            },
            {
              fileData: {
                mimeType: "video/mp4",
                fileUri: dataset.gcsUri
              }
            }
          ]
        }
      ],
      generationConfig: {
        mediaResolution: "MEDIA_RESOLUTION_LOW"
      },
      response: JSON.stringify({
        overall: dataset.overallScore,
        dimensions: dataset.dimensions,
        reasoning: dataset.notes || ""
      })
    };

    return JSON.stringify(example);
  }

  /**
   * Submit a fine-tuning job to Vertex AI
   */
  async submitTuningJob(config: TuningJobConfig): Promise<TuningJob> {
    const endpoint = `${this.apiEndpoint}/projects/${this.projectId}/locations/${this.location}/tuningJobs`;

    const requestBody = {
      baseModel: this.baseModel,
      supervisedTuningSpec: {
        trainingDatasetUri: config.trainingDataUri,
        validationDatasetUri: config.validationDataUri,
        hyperParameters: {
          epochCount: config.epochs || 5,
          learningRateMultiplier: config.learningRateMultiplier || 1.0,
          adapterSize: config.adapterSize || 8
        }
      },
      tunedModelDisplayName: config.displayName
    };

    console.log(`🚀 Submitting tuning job: ${config.displayName}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to submit tuning job: ${error}`);
    }

    const job = await response.json();
    console.log(`✅ Tuning job submitted: ${job.name}`);

    return {
      name: job.name,
      displayName: config.displayName,
      state: job.state || 'JOB_STATE_PENDING',
      createTime: job.createTime,
      updateTime: job.updateTime
    };
  }

  /**
   * Get the status of a tuning job
   */
  async getTuningJobStatus(jobName: string): Promise<TuningJob> {
    const response = await fetch(`${this.apiEndpoint}/${jobName}`, {
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${await response.text()}`);
    }

    const job = await response.json();

    return {
      name: job.name,
      displayName: job.tunedModelDisplayName,
      state: job.state,
      createTime: job.createTime,
      updateTime: job.updateTime,
      tunedModelEndpoint: job.tunedModel?.endpoint,
      error: job.error?.message
    };
  }

  /**
   * List all tuning jobs
   */
  async listTuningJobs(): Promise<TuningJob[]> {
    const endpoint = `${this.apiEndpoint}/projects/${this.projectId}/locations/${this.location}/tuningJobs`;

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list tuning jobs: ${await response.text()}`);
    }

    const data = await response.json();
    
    return (data.tuningJobs || []).map((job: any) => ({
      name: job.name,
      displayName: job.tunedModelDisplayName,
      state: job.state,
      createTime: job.createTime,
      updateTime: job.updateTime,
      tunedModelEndpoint: job.tunedModel?.endpoint,
      error: job.error?.message
    }));
  }

  /**
   * Cancel a running tuning job
   */
  async cancelTuningJob(jobName: string): Promise<void> {
    const response = await fetch(`${this.apiEndpoint}/${jobName}:cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel job: ${await response.text()}`);
    }

    console.log(`🛑 Tuning job cancelled: ${jobName}`);
  }

  /**
   * Get access token for Vertex AI API calls
   */
  private async getAccessToken(): Promise<string> {
    // Use Google Cloud credentials
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token!;
  }

  /**
   * Generate content using a fine-tuned model
   */
  async generateWithTunedModel(
    tunedModelEndpoint: string,
    videoGcsUri: string,
    prompt?: string
  ): Promise<{
    overall: number;
    dimensions: Record<string, number>;
    reasoning: string;
  }> {
    const defaultPrompt = "Rate this video for content quality and engagement potential. Analyze the hook, pacing, originality, payoff, and rewatchability. Provide scores from 0 to 1.";

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt || defaultPrompt },
            {
              fileData: {
                mimeType: "video/mp4",
                fileUri: videoGcsUri
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        mediaResolution: "MEDIA_RESOLUTION_LOW",
        // Disable thinking for tuned models as recommended
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    const response = await fetch(`${tunedModelEndpoint}:generateContent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Failed to generate content: ${await response.text()}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    try {
      return JSON.parse(text);
    } catch {
      return {
        overall: 0.5,
        dimensions: {},
        reasoning: text
      };
    }
  }

  /**
   * Analyze a video using base Gemini model via Vertex AI
   * This supports GCS URIs unlike the consumer Gemini SDK
   */
  async analyzeVideoWithGemini(
    videoGcsUri: string,
    prompt: string
  ): Promise<{
    overall: number;
    dimensions: Record<string, number>;
    reasoning: string;
  }> {
    // Use Vertex AI Gemini endpoint
    const model = 'gemini-2.0-flash-001';
    const endpoint = `${this.apiEndpoint}/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                mimeType: "video/mp4",
                fileUri: videoGcsUri
              }
            },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192  // Increased for comprehensive script analysis
      }
    };

    console.log(`🎬 Analyzing video with Vertex AI Gemini: ${videoGcsUri}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex AI error:', errorText);
      throw new Error(`Vertex AI analysis failed: ${errorText}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    console.log('🎬 Gemini response:', text.slice(0, 200));

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        overall: 0.5,
        dimensions: {},
        reasoning: text
      };
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return {
        overall: 0.5,
        dimensions: {},
        reasoning: text
      };
    }
  }
}

export function createVertexTuningService(config?: Partial<TuningConfig>): VertexTuningService {
  return new VertexTuningService(config);
}