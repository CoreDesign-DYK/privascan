import { spawnSync } from 'node:child_process';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') {
  console.error('Usage: node scripts/capacitor-live-sync.mjs <android|ios>');
  process.exit(1);
}

const configuredUrl = process.env.CAPACITOR_LIVE_RELOAD_URL?.trim();
const replitDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
const liveReloadUrl = configuredUrl || (replitDomain ? `https://${replitDomain}` : '');

if (!liveReloadUrl) {
  console.error(
    'Set CAPACITOR_LIVE_RELOAD_URL, or run this command inside Replit with REPLIT_DEV_DOMAIN available.',
  );
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(liveReloadUrl);
} catch {
  console.error('The Live Reload URL is invalid.');
  process.exit(1);
}

if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
  console.error('The Live Reload URL must be a credential-free HTTPS URL.');
  process.exit(1);
}

console.info(`Syncing ${platform} with Live Reload from ${parsedUrl.origin}${parsedUrl.pathname}`);
const result = spawnSync(
  'pnpm',
  ['exec', 'cap', 'sync', platform],
  {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      CAPACITOR_LIVE_RELOAD_URL: parsedUrl.toString().replace(/\/$/, ''),
    },
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);