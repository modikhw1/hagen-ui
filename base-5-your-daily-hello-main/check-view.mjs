import { createClient } from \"@supabase/supabase-js\";
import dotenv from \"dotenv\";
import path from \"path\";
import { fileURLToPath } from \"url\";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, \".env\") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(\"Missing Supabase env vars\");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkView() {
  const { data, error } = await supabase
    .from(\"v_admin_service_costs_30d\")
    .select(\"*\")
    .limit(1);

  if (error) {
    console.error(\"Error fetching from view:\", error);
  } else {
    console.log(\"View data:\", data);
  }
}

checkView();
