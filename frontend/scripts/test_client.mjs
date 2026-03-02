import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yquqkoeptxqgfaiatstk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxdXFrb2VwdHhxZ2ZhaWF0c3RrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkyODExNywiZXhwIjoyMDg3NTA0MTE3fQ.2gyjlWqoqNpUS4-Azt7u4tH-iHkwF06-M7kpPEeoSsE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    try {
        console.log("Fetching cogs...");
        const { data, error } = await supabase.from('cogs').select('*').limit(1);
        console.log("Data:", data);
        console.log("Error:", error);
    } catch (err) {
        console.error("Fetch Exception:", err);
    }
}

test();
