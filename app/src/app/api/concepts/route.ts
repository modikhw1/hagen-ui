import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getServerSupabase() as any

    // Get all active concepts
    const { data: concepts, error: conceptsError } = await supabase
      .from('concepts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (conceptsError) {
      console.error('Error fetching concepts:', conceptsError)
      return NextResponse.json({ error: conceptsError.message }, { status: 500 })
    }

    // Get user-specific data for these concepts
    const { data: userConcepts, error: userConceptsError } = await supabase
      .from('user_concepts')
      .select('*')
      .eq('user_id', userId)

    if (userConceptsError) {
      console.error('Error fetching user concepts:', userConceptsError)
    }

    // Create lookup map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userConceptMap = new Map<string, any>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (userConcepts || []).map((uc: any) => [uc.concept_id, uc])
    )

    // Transform to flat structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedConcepts = (concepts || []).map((concept: any) => {
      const userConcept = userConceptMap.get(concept.id)
      return {
        id: concept.id,
        headline: concept.headline,
        originCountry: concept.origin_country,
        originFlag: concept.origin_flag,
        trendLevel: concept.trend_level,
        difficulty: concept.difficulty,
        peopleNeeded: concept.people_needed,
        filmTime: concept.film_time,
        price: concept.price,
        videoUrl: concept.video_url,
        scriptContent: concept.script_content,
        matchPercentage: userConcept?.match_percentage || 50,
        whyItFits: userConcept?.why_it_fits || [],
        isPurchased: userConcept?.is_purchased || false,
        purchasedAt: userConcept?.purchased_at,
      }
    })

    return NextResponse.json({ concepts: transformedConcepts })
  } catch (error) {
    console.error('Concepts API error:', error)
    return NextResponse.json({ error: 'Failed to fetch concepts' }, { status: 500 })
  }
}
