import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('v_admin_customer_list').select('id, business_name, expected_concepts_per_week, planned_concepts_count, account_manager, status');
  
  if (error) {
    console.error('Error fetching data:', error);
    return;
  }
  
  const cmStats = {};
  let foundDifference = false;
  
  for (const c of data) {
    if (!c.account_manager) continue;
    if (c.status === 'paused') continue;
    
    const pace = c.expected_concepts_per_week ?? 2;
    const planned = c.planned_concepts_count || 0;
    
    const newNumerator = Math.min(planned, pace);
    
    if (!cmStats[c.account_manager]) {
      cmStats[c.account_manager] = { oldNum: 0, newNum: 0, den: 0, customersOver: [] };
    }
    
    cmStats[c.account_manager].oldNum += planned;
    cmStats[c.account_manager].newNum += newNumerator;
    cmStats[c.account_manager].den += pace;
    
    if (planned > pace) {
      cmStats[c.account_manager].customersOver.push({ name: c.business_name, planned, pace });
    }
  }
  
  for (const [cmId, stats] of Object.entries(cmStats)) {
    if (stats.oldNum !== stats.newNum) {
      foundDifference = true;
      console.log(`\nCM ${cmId}:`);
      console.log(`  Gamla logiken: ${stats.oldNum} / ${stats.den}`);
      console.log(`  Nya logiken:   ${stats.newNum} / ${stats.den}`);
      console.log(`  Dessa kunder drar ner totalen nu:`, stats.customersOver);
    }
  }
  
  if (!foundDifference) {
    console.log('\nINGEN SKILLNAD HITTADES I DATABASEN! Just nu finns det ingen kund som har fler planerade koncept än sitt eget tempo.');
  }
}

run();
