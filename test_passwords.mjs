import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ajbwbmlmikttytnczrpj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqYndibWxtaWt0dHl0bmN6cnBqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3NDA2MSwiZXhwIjoyMDg4MjUwMDYxfQ.9C-QJBIFpGHRbPK8E0zp2megyJu-FZ9LBtWl2f_GmKM';

const supabase = createClient(supabaseUrl, supabaseKey);

const emails = ['demo.admin@aura-hotel.test'];
const passwords = ['password', 'password123', 'admin123', 'demo123', 'guest123', 'AuraHotel123!', '123456', '12345678', 'admin', 'demo'];

async function main() {
  for (const email of emails) {
    console.log(`Testing passwords for ${email}...`);
    for (const password of passwords) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!error && data.user) {
        console.log(`FOUND! Email: ${email}, Password: ${password}`);
        return;
      }
    }
  }
  console.log("No common passwords worked.");
}
main();
