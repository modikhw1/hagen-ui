const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load env file manually
const envPath = '/workspaces/hagen/.env.local';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportBrandProfiles() {
  console.log('Fetching brand profiles...');
  
  // Get all brand profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('brand_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
    return;
  }

  console.log(`Found ${profiles.length} brand profiles`);

  // For each profile, get conversations and messages
  const fullDataset = await Promise.all(profiles.map(async (profile) => {
    // Get conversations for this profile
    const { data: conversations } = await supabase
      .from('brand_conversations')
      .select('*')
      .eq('brand_profile_id', profile.id)
      .order('created_at', { ascending: false });

    // Get messages for each conversation
    const conversationsWithMessages = await Promise.all((conversations || []).map(async (conv) => {
      const { data: messages } = await supabase
        .from('brand_conversation_messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('message_index', { ascending: true });

      return {
        ...conv,
        messages: messages || []
      };
    }));

    // Get reference videos if any
    const { data: referenceVideos } = await supabase
      .from('brand_reference_videos')
      .select('*')
      .eq('brand_profile_id', profile.id);

    return {
      profile,
      conversations: conversationsWithMessages,
      reference_videos: referenceVideos || []
    };
  }));

  // Save to file
  const date = new Date().toISOString().split('T')[0];
  const filename = `exports/brand_profile_dataset_${date}.json`;
  
  fs.writeFileSync(filename, JSON.stringify(fullDataset, null, 2));
  
  console.log(`\nDataset exported to ${filename}`);
  console.log('\nSummary:');
  console.log(`- Total profiles: ${fullDataset.length}`);
  console.log(`- Total conversations: ${fullDataset.reduce((sum, p) => sum + p.conversations.length, 0)}`);
  console.log(`- Total messages: ${fullDataset.reduce((sum, p) => sum + p.conversations.reduce((s, c) => s + c.messages.length, 0), 0)}`);
  console.log(`- Total reference videos: ${fullDataset.reduce((sum, p) => sum + p.reference_videos.length, 0)}`);
}

exportBrandProfiles().catch(console.error);
