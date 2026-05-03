/**
 * Vertex AI Training API
 * 
 * Endpoints for managing fine-tuning jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createVertexTuningService, TrainingDataset } from '@/lib/services/vertex/training';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/vertex/training
 * 
 * Start a new fine-tuning job
 * Body: { name?: string, epochs?: number, learningRateMultiplier?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, epochs, learningRateMultiplier, adapterSize } = body;

    // Get all unexported ratings with GCS URIs
    const { data: ratings, error } = await supabase
      .from('video_ratings')
      .select(`
        id,
        overall_score,
        dimensions,
        notes,
        video:analyzed_videos(id, video_url, gcs_uri)
      `)
      .not('overall_score', 'is', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!ratings || ratings.length < 10) {
      return NextResponse.json({
        error: 'Not enough training data. Need at least 10 rated videos with GCS URIs.',
        currentCount: ratings?.length || 0
      }, { status: 400 });
    }

    // Filter to only videos with GCS URIs
    const validRatings = ratings.filter((r: any) => r.video?.gcs_uri);

    if (validRatings.length < 10) {
      return NextResponse.json({
        error: 'Not enough videos uploaded to GCS. Upload videos first.',
        totalRatings: ratings.length,
        withGcsUri: validRatings.length
      }, { status: 400 });
    }

    // Prepare training datasets
    const datasets: TrainingDataset[] = validRatings.map((r: any) => ({
      videoId: r.video.id,
      gcsUri: r.video.gcs_uri,
      overallScore: r.overall_score,
      dimensions: r.dimensions || {},
      notes: r.notes
    }));

    // Initialize Vertex tuning service
    const vertexService = createVertexTuningService();

    // Prepare and upload training data
    const { trainUri, validationUri } = await vertexService.prepareTrainingData(datasets);

    // Submit tuning job
    const jobName = name || `hagen-video-model-${Date.now()}`;
    const job = await vertexService.submitTuningJob({
      displayName: jobName,
      trainingDataUri: trainUri,
      validationDataUri: validationUri,
      epochs: epochs || 5,
      learningRateMultiplier: learningRateMultiplier || 1.0,
      adapterSize: adapterSize || 8
    });

    // Store job info in database
    await supabase.from('tuning_jobs').insert({
      job_name: job.name,
      display_name: job.displayName,
      state: job.state,
      training_data_uri: trainUri,
      validation_data_uri: validationUri,
      training_examples: datasets.length,
      config: { epochs, learningRateMultiplier, adapterSize }
    });

    // Mark ratings as exported
    await supabase
      .from('video_ratings')
      .update({ 
        training_exported: true, 
        exported_at: new Date().toISOString() 
      })
      .in('id', validRatings.map((r: any) => r.id));

    return NextResponse.json({
      success: true,
      job: {
        name: job.name,
        displayName: job.displayName,
        state: job.state,
        trainingExamples: datasets.length
      }
    });

  } catch (err) {
    console.error('Training API error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to start training'
    }, { status: 500 });
  }
}

/**
 * GET /api/vertex/training
 * 
 * List all tuning jobs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobName = searchParams.get('job');

    const vertexService = createVertexTuningService();

    if (jobName) {
      // Get specific job status
      const job = await vertexService.getTuningJobStatus(jobName);
      
      // Update local database
      await supabase
        .from('tuning_jobs')
        .update({
          state: job.state,
          tuned_model_endpoint: job.tunedModelEndpoint,
          error_message: job.error,
          updated_at: new Date().toISOString()
        })
        .eq('job_name', jobName);

      return NextResponse.json(job);
    }

    // List all jobs
    const jobs = await vertexService.listTuningJobs();

    return NextResponse.json({
      jobs,
      count: jobs.length
    });

  } catch (err) {
    console.error('Training list error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to list jobs'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/vertex/training
 * 
 * Cancel a tuning job
 * Body: { jobName: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobName } = body;

    if (!jobName) {
      return NextResponse.json({ error: 'jobName is required' }, { status: 400 });
    }

    const vertexService = createVertexTuningService();
    await vertexService.cancelTuningJob(jobName);

    // Update local database
    await supabase
      .from('tuning_jobs')
      .update({
        state: 'JOB_STATE_CANCELLED',
        updated_at: new Date().toISOString()
      })
      .eq('job_name', jobName);

    return NextResponse.json({ success: true, cancelled: jobName });

  } catch (err) {
    console.error('Cancel job error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to cancel job'
    }, { status: 500 });
  }
}
