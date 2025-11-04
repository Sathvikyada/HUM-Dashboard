import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const emailsToCheck = [
  'sean.deegan@snhu.edu',
  'zayeedbinkabir@gmail.com',
  'kswenson@bu.edu',
  'ali.azam@rutgers.edu',
  'dupontlucian@gmail.com',
  'rl632822@wne.edu',
  'mb604003@wne.edu',
  'tasbiauddin@gmail.com',
  'jb605077@wne.edu',
  'ardidauti6@gmail.com',
  'terrell_osborne@uri.edu',
  'kompella.sa@northeastern.edu',
  'lia.erisson15@gmail.com',
  'cabalona.e@northeastern.edu',
  'ishitash4@gmail.com',
  'kykyleb40@gmail.com',
  'ew457@cornell.edu',
  'jc2886@cornell.edu',
  'anastasiatumanov@gmail.com',
  'abigail.f.mcclintock@proton.me',
  'riwaz@bu.edu',
  'eduvert@wesleyan.edu',
  'Ad605543@wne.edu',
  'Brianmaki1234@gmail.com',
  'mchohda1@terpmail.umd.edu',
  'jdawgg911@gmail.com',
  'hdawy@bu.edu',
  'dsch28@bu.edu',
  'farhan1@mit.edu',
  'krish2008.parmar@gmail.com',
  'nahian@mit.edu',
  'ndisha@mit.edu',
  'as631863@wne.edu',
  'tdn26903@bu.edu',
  'nxhoang@bu.edu',
  'nguyenle@bu.edu',
  'minhd5@bu.edu',
  'virmania@purdue.edu',
  'gangina.v@northeastern.edu',
  'pranshushah2024@gmail.com',
  'prettyvoke05@gmail.com',
  'hoangky271106@gmail.com',
  'siddsingh@cs.stonybrook.edu',
  'cpimentelortiz80@gmail.com',
  'ssriram1013@gmail.com',
  'dl645932@wne.edu',
  'ab620589@wne.edu',
  'mcgreevy.a@northeastern.edu',
  'hoangbach_nguyen@student.uml.edu',
  'ssghai@umd.edu',
  'SashaKakkassery@gmail.com',
  'eduvert@wesleyan.edu',
  'hoangbach_nguyen@student.uml.edu',
  'Kelbychau11204@gmail.com',
  'shen.ra@northeastern.edu',
  'aec6237@psu.edu',
  'kyle.chiem@outlook.com',
  'pps5577@psu.edu',
  'lbl5561@psu.edu',
  'smb8629@psu.edu',
  'egerjosiah@gmail.com',
  'alexander.mcgreevy@icloud.com',
  'nd10s@terpmail.umd.edu',
  'adityamanojkrishna2005@gmail.com',
  'basantana@wpi.edu',
  'nikitul2005@gmail.com',
  'afrenk.biz@gmail.com',
  'saikiransanju22@gmail.com',
  'victorlong7865@gmail.com',
  'Madhavlodha2503@gmail.com',
  'nicholas.m.chong@gmail.com',
  'ianpang126@gmail.com',
  'liu.denn@northeastern.edu',
  'simpsonn978@gmail.com',
  'gltan9265@gmail.com',
  'igifford01752@gmail.com',
  'kboscombe@student.bridgew.edu',
  'c1dicarlo@student.bridgew.edu'
];

async function listEmailsExact() {
  try {
    // Normalize emails and get unique ones
    const normalizedEmails = emailsToCheck.map(e => e.trim().toLowerCase());
    const uniqueEmails = [...new Set(normalizedEmails)];
    
    console.log('📋 Emails as stored in database (with original casing):\n');
    
    const foundEmails: string[] = [];

    // Get each email as stored in database
    for (const email of uniqueEmails) {
      const { data, error } = await supabase
        .from('applicants')
        .select('email')
        .ilike('email', email)
        .single();

      if (!error && data) {
        foundEmails.push(data.email); // Use exact casing from database
      }
    }

    // Sort alphabetically (case-insensitive)
    foundEmails.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    // Output the list
    foundEmails.forEach((email, idx) => {
      console.log(`${idx + 1}. ${email}`);
    });

    console.log(`\n📊 Total: ${foundEmails.length} emails`);

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

listEmailsExact();
