import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
 
async function backupDb() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backups/ss4-backup-${ts}.sql`;
  const dbUrl = process.env.DATABASE_URL; // Supabase direct connection URL
 
  if (!dbUrl) {
    console.error('DATABASE_URL not set. Find it in Supabase → Settings → Database → Connection string.');
    return;
  }
 
  console.log(`\n💾 Backing up to ${filename}...`);
  try {
    execSync(`mkdir -p backups`);
    execSync(`pg_dump "${dbUrl}" > ${filename}`);
    console.log(`✓ Backup saved: ${filename}`);
  } catch (e: any) {
    console.error('Backup failed:', e.message);
    console.log('Tip: install pg_dump with: brew install postgresql (macOS) or apt install postgresql-client (Linux)');
  }
}
backupDb().catch(console.error);