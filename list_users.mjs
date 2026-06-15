import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ajbwbmlmikttytnczrpj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqYndibWxtaWt0dHl0bmN6cnBqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3NDA2MSwiZXhwIjoyMDg4MjUwMDYxfQ.9C-QJBIFpGHRbPK8E0zp2megyJu-FZ9LBtWl2f_GmKM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error("Error fetching users:", usersError);
    return;
  }
  
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*');
  if (profilesError) {
    console.error("Error fetching profiles:", profilesError);
    return;
  }
  
  console.log("Users and Roles:");
  for (const user of usersData.users) {
    const profile = profiles.find(p => p.id === user.id);
    console.log(`Email: ${user.email}, Role: ${profile ? profile.role : 'None'}, Provider: ${user.app_metadata.providers.join(', ')}`);
  }
}
main();
