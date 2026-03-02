import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

// Bypass local SSL Firewall/Antivirus interception issues on Windows machines
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log("Testing Supabase connection...");
    const { data, error } = await supabase.from('users').select('*').limit(1).catch(err => ({ error: err, data: null }));
    if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('relation "users" does not exist')) {
            console.log("Connection successful, but 'users' table doesn't exist. Let's try testing an RPC or just fetching anything else...");
            // This is still a success in terms of connection
            const { data: d2, error: e2 } = await supabase.rpc('version').catch(err => ({ error: err, data: null }));
            if (e2) {
                console.error("RPC test failed:", e2);
            } else {
                console.log("Connection verified via RPC:", d2);
            }
        } else {
            console.error("Connection failed:", error);
        }
    } else {
        console.log("Connection successful! Data:", data);
    }
}

testConnection();
