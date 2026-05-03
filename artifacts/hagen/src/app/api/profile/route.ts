import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import { z } from 'zod'

const uuidSchema = z.string().uuid('Invalid user ID format')

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')

    // Validate UUID format to prevent SQL injection
    if (userId) {
      const validation = uuidSchema.safeParse(userId)
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid user ID format' },
          { status: 400 }
        )
      }
    }

    const supabase = supabaseAdmin()

    let query = supabase
      .from('profiles')
      .select('*')

    if (userId) {
      query = query.eq('id', userId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch profile',
      },
      { status: 500 }
    )
  }
}

const updateProfileSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  full_name: z.string().max(100).optional(),
  avatar_url: z.string().url('Invalid URL').max(500).optional(),
})

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const validation = updateProfileSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid input data',
          details: validation.error.errors 
        },
        { status: 400 }
      )
    }

    const { userId, full_name, avatar_url } = validation.data

    const supabase = supabaseAdmin()

    const { data, error } = await (supabase.from('profiles') as any)
      .update({
        full_name: full_name ?? null,
        avatar_url: avatar_url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()

    if (error) throw error

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data[0],
    })
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update profile',
      },
      { status: 500 }
    )
  }
}
