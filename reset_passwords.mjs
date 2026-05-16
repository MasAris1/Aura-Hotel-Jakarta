import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ajbwbmlmikttytnczrpj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqYndibWxtaWt0dHl0bmN6cnBqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3NDA2MSwiZXhwIjoyMDg4MjUwMDYxfQ.9C-QJBIFpGHRbPK8E0zp2megyJu-FZ9LBtWl2f_GmKM';

const supabase = createClient(supabaseUrl, supabaseKey);

const demoEmails = [
  'demo.admin@aura-hotel.test',
  'demo.receptionist@aura-hotel.test',
  'demo.guest@aura-hotel.test'
];
const newPassword = 'password123';

async function main() {
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error("Error fetching users:", usersError);
    return;
  }
  
  for (const user of usersData.users) {
    if (demoEmails.includes(user.email)) {
      console.log(`Resetting password for ${user.email}...`);
      const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });
      if (error) {
        console.error(`Failed to reset password for ${user.email}:`, error);
      } else {
        console.log(`Successfully reset password for ${user.email} to '${newPassword}'`);
      }
    }
  }
}
main();
