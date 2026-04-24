import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST - Run database migration for Stripe fields
export const POST = withAuth(async (request: NextRequest) => {
  try {
    // Simple secret check to prevent unauthorized runs
    const body = await request.json();
    if (!process.env.MIGRATION_SECRET || body.secret !== process.env.MIGRATION_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Run migrations using a raw SQL approach via the Postgres internal
    // Since we can't run raw SQL via REST API, we'll try to add columns via ALTER TABLE
    // by checking if they exist first and adding if not
    
    const migrations = [
      { sql: "ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT", name: 'stripe_customer_id' },
      { sql: "ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT", name: 'stripe_subscription_id' },
      { sql: "ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS invoice_text TEXT", name: 'invoice_text' },
      { sql: "ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS scope_items JSONB DEFAULT '[]'::jsonb", name: 'scope_items' },
      { sql: "ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS subscription_interval TEXT DEFAULT 'month'", name: 'subscription_interval' },
    ];

    const results = [];

    for (const migration of migrations) {
      try {
        // Try to insert a row to trigger the column addition - this won't work directly
        // Instead, we'll use a workaround: try to select the column
        await supabaseAdmin
          .from('customer_profiles')
          .select(migration.name)
          .limit(0);
        
        // If error is about column not existing, we need another approach
        // For now, just return the SQL for manual execution
        results.push({ 
          column: migration.name, 
          status: 'needs_manual_migration',
          sql: migration.sql 
        });
      } catch (e) {
        results.push({ column: migration.name, error: String(e) });
      }
    }

    return NextResponse.json({ 
      message: 'Migration script generated',
      results,
      sql: migrations.map(m => m.sql).join(';\n')
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}, ['admin']);
