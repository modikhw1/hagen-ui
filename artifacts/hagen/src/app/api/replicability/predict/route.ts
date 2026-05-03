import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';

// Configuration
const CONFIG = {
  projectId: '1061681256498', // Project Number/ID
  location: 'us-central1',
  endpointId: '4053959844749639680', // The deployed Endpoint ID (v2 - Checkpoint 4)
};

const ANALYSIS_PROMPT = `Analysera denna video ur ett replikerbarhetsperspektiv.
Bedöm hur enkelt eller svårt det är för ett företag att återskapa detta koncept.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vilka resurser krävs? (Plats, utrustning, personal)
3. Hur komplex är redigeringen?
4. Vad är svårighetsgraden för replikering?

Ge en neutral, strukturerad analys på svenska.`;

export async function POST(request: Request) {
  try {
    const { video_id } = await request.json();

    if (!video_id) {
      return NextResponse.json({ error: 'Missing video_id' }, { status: 400 });
    }

    // 1. Get GCS URI from Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: videoData, error: dbError } = await supabase
      .from('analyzed_videos')
      .select('gcs_uri')
      .eq('id', video_id)
      .single();

    if (dbError || !videoData || !videoData.gcs_uri) {
      console.error('Supabase error or no GCS URI:', dbError);
      return NextResponse.json({ error: 'Video not found or missing GCS URI' }, { status: 404 });
    }

    const gcsUri = videoData.gcs_uri;

    // 2. Authenticate with Google
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // 3. Call Vertex AI Endpoint
    const geminiEndpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/projects/${CONFIG.projectId}/locations/${CONFIG.location}/endpoints/${CONFIG.endpointId}:generateContent`;

    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: gcsUri,
                mimeType: "video/mp4"
              }
            },
            {
              text: ANALYSIS_PROMPT
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
      }
    };

    const response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(geminiBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex AI Error:', errorText);
      return NextResponse.json({ error: `Vertex AI Error: ${response.statusText}` }, { status: response.status });
    }

    const result = await response.json();
    
    // Extract text from Gemini response
    let analysisText = '';
    if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) {
        analysisText = result.candidates[0].content.parts.map((p: any) => p.text).join('');
    }

    return NextResponse.json({ analysis: analysisText });

  } catch (error: any) {
    console.error('Prediction API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
