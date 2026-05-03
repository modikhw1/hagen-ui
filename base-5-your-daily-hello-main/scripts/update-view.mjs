import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260426100000_optimize_admin_customer_list_view.sql'), 'utf-8');

async function run() {
  const { data, error } = await sb.rpc('exec_sql', { sql: sql });
  if (error) {
    console.error("RPC failed:", error.message);
  } else {
    console.log("Success with RPC!");
  }
}
run();