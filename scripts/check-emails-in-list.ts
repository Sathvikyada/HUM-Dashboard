import fs from 'fs';
import path from 'path';

const emailsToCheck = [
  'ab620589@wne.edu',
  'abigail.f.mcclintock@proton.me',
  'Ad605543@wne.edu',
  'adityamanojkrishna2005@gmail.com',
  'aec6237@psu.edu',
  'afrenk.biz@gmail.com',
  'alexander.mcgreevy@icloud.com',
  'ali.azam@rutgers.edu',
  'anastasiatumanov@gmail.com',
  'ardidauti6@gmail.com',
  'as631863@wne.edu',
  'basantana@wpi.edu',
  'Brianmaki1234@gmail.com',
  'c1dicarlo@student.bridgew.edu',
  'cabalona.e@northeastern.edu',
  'cpimentelortiz80@gmail.com',
  'dl645932@wne.edu',
  'dsch28@bu.edu',
  'dupontlucian@gmail.com',
  'eduvert@wesleyan.edu',
  'egerjosiah@gmail.com',
  'ew457@cornell.edu',
  'farhan1@mit.edu',
  'gangina.v@northeastern.edu',
  'gltan9265@gmail.com',
  'hdawy@bu.edu',
  'hoangbach_nguyen@student.uml.edu',
  'hoangky271106@gmail.com',
  'ianpang126@gmail.com',
  'igifford01752@gmail.com',
  'ishitash4@gmail.com',
  'jb605077@wne.edu',
  'jc2886@cornell.edu',
  'jdawgg911@gmail.com',
  'kboscombe@student.bridgew.edu',
  'Kelbychau11204@gmail.com',
  'kompella.sa@northeastern.edu',
  'krish2008.parmar@gmail.com',
  'kswenson@bu.edu',
  'kykyleb40@gmail.com',
  'kyle.chiem@outlook.com',
  'lbl5561@psu.edu',
  'lia.erisson15@gmail.com',
  'liu.denn@northeastern.edu',
  'Madhavlodha2503@gmail.com',
  'mb604003@wne.edu',
  'mcgreevy.a@northeastern.edu',
  'mchohda1@terpmail.umd.edu',
  'minhd5@bu.edu',
  'nahian@mit.edu',
  'nd10s@terpmail.umd.edu',
  'ndisha@mit.edu',
  'nguyenle@bu.edu',
  'nicholas.m.chong@gmail.com',
  'nikitul2005@gmail.com',
  'nxhoang@bu.edu',
  'pps5577@psu.edu',
  'pranshushah2024@gmail.com',
  'prettyvoke05@gmail.com',
  'riwaz@bu.edu',
  'rl632822@wne.edu',
  'saikiransanju22@gmail.com',
  'SashaKakkassery@gmail.com',
  'sean.deegan@snhu.edu',
  'shen.ra@northeastern.edu',
  'siddsingh@cs.stonybrook.edu',
  'simpsonn978@gmail.com',
  'smb8629@psu.edu',
  'ssghai@umd.edu',
  'ssriram1013@gmail.com',
  'tasbiauddin@gmail.com',
  'tdn26903@bu.edu',
  'terrell_osborne@uri.edu',
  'victorlong7865@gmail.com',
  'virmania@purdue.edu',
  'zayeedbinkabir@gmail.com',
  'yangryan133@gmail.com',
];

// Read the delivered emails list
const listFile = path.join(process.cwd(), 'delivered-emails-list.txt');
if (!fs.existsSync(listFile)) {
  console.error('❌ delivered-emails-list.txt not found');
  console.log('   Run "npm run generate-delivered-emails" first to generate the list');
  process.exit(1);
}

const fileContent = fs.readFileSync(listFile, 'utf-8');
const lines = fileContent.split('\n').filter(line => {
  const trimmed = line.trim();
  return trimmed && !trimmed.startsWith('#') && trimmed.includes('|');
});

// Extract emails from the list (lowercase for comparison)
const listEmails = new Set<string>();
lines.forEach(line => {
  const [email] = line.split('|').map(s => s.trim());
  if (email) {
    listEmails.add(email.toLowerCase());
  }
});

console.log(`📧 Checking ${emailsToCheck.length} emails against the mailing list...\n`);
console.log(`📋 Mailing list contains ${listEmails.size} emails\n`);

// Check each email
const found: string[] = [];
const notFound: string[] = [];

emailsToCheck.forEach(email => {
  const emailLower = email.toLowerCase();
  if (listEmails.has(emailLower)) {
    found.push(email);
  } else {
    notFound.push(email);
  }
});

console.log('='.repeat(80));
console.log('📊 VERIFICATION RESULTS');
console.log('='.repeat(80));
console.log(`\n✅ Found in mailing list: ${found.length} emails`);
console.log(`❌ NOT found in mailing list: ${notFound.length} emails\n`);

if (found.length > 0) {
  console.log('⚠️  WARNING: These emails ARE in the mailing list:\n');
  found.forEach((email, index) => {
    console.log(`   ${index + 1}. ${email}`);
  });
  console.log('');
}

if (notFound.length > 0) {
  console.log('✅ GOOD: These emails are NOT in the mailing list:\n');
  notFound.forEach((email, index) => {
    console.log(`   ${index + 1}. ${email}`);
  });
  console.log('');
}

// Generate report files
if (found.length > 0) {
  const foundFile = path.join(process.cwd(), 'emails-found-in-list.txt');
  fs.writeFileSync(foundFile, found.join('\n'), 'utf-8');
  console.log(`📝 Found emails written to: ${foundFile}\n`);
}

if (notFound.length > 0) {
  const notFoundFile = path.join(process.cwd(), 'emails-not-in-list.txt');
  fs.writeFileSync(notFoundFile, notFound.join('\n'), 'utf-8');
  console.log(`📝 Not found emails written to: ${notFoundFile}\n`);
}

// Generate CSV report
const csvFile = path.join(process.cwd(), 'email-verification-report.csv');
const csvLines = ['Email,In List'];
emailsToCheck.forEach(email => {
  const emailLower = email.toLowerCase();
  const inList = listEmails.has(emailLower) ? 'Yes' : 'No';
  csvLines.push(`"${email}","${inList}"`);
});
fs.writeFileSync(csvFile, csvLines.join('\n'), 'utf-8');
console.log(`📝 Full verification report written to: ${csvFile}\n`);

if (found.length === 0) {
  console.log('✅ SUCCESS: All emails are NOT in the mailing list!\n');
  process.exit(0);
} else {
  console.log(`⚠️  WARNING: ${found.length} emails are in the mailing list!\n`);
  process.exit(1);
}

