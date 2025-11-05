import { sendDiscordLinkUpdate } from '../netlify/functions/_utils/email';
import dotenv from 'dotenv';

dotenv.config();

const testEmail = process.argv[2];
const testName = process.argv[3] || testEmail;

if (!testEmail) {
  console.error('❌ Usage: npm run test-discord-email <email> [name]');
  console.error('   Example: npm run test-discord-email test@example.com "Test User"');
  process.exit(1);
}

async function test() {
  try {
    console.log(`📧 Sending Discord update email to ${testEmail}...\n`);
    
    await sendDiscordLinkUpdate({
      to: testEmail,
      name: testName,
    });

    console.log(`✅ Test email sent successfully to ${testEmail}!`);
    console.log(`\nCheck your inbox for the Discord update email.`);
  } catch (err: any) {
    console.error('❌ Error sending test email:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

test();

