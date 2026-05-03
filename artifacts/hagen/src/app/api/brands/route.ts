/**
 * Brand Profiles API
 *
 * GET /api/brands - List brand profiles
 * POST /api/brands - Create brand profile
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Schema matches existing brand_profiles table
const createBrandSchema = z.object({
  name: z.string().min(1).max(100),
  business_type: z.string().optional(),
  characteristics: z.record(z.any()).optional(),
  tone: z.record(z.any()).optional(),
  target_audience: z.record(z.any()).optional(),
  goals: z.record(z.any()).optional(),
  conversation_synthesis: z.string().optional(),
  key_insights: z.array(z.string()).optional(),
  status: z.enum(['draft', 'complete', 'archived']).default('draft')
})

// GET - List brand profiles
export async function GET() {
  try {
    const { data: brands, error } = await supabase
      .from('brand_profiles')
      .select('*')
      .order('name')

    if (error) {
      return NextResponse.json({ brands: [] })
    }

    return NextResponse.json({ brands: brands || [] })

  } catch (error) {
    console.error('Failed to list brands:', error)
    return NextResponse.json({ brands: [] })
  }
}

// POST - Create brand profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createBrandSchema.parse(body)

    const { data: brand, error } = await supabase
      .from('brand_profiles')
      .insert(data)
      .select()
      .single()

    if (error) {
      console.error('Failed to create brand:', error)
      return NextResponse.json(
        { error: 'create-failed', message: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, brand })

  } catch (error) {
    console.error('Brand create failed:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'create-failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
