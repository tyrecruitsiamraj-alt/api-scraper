import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTalentScrape } from './core/scrape-pipeline.js';
import { normalizePlatformMode, platformLabel, resolvePlatforms } from './core/platform-resolve.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const platform = normalizePlatformMode(process.env.SCRAPE_PLATFORM || 'jobbkk');
const platforms = resolvePlatforms(platform, platform);

console.log('');
console.log(`>>> SCRAPE_PLATFORM = ${platform} <<<`);
console.log(`    จะรัน: ${platforms.map(platformLabel).join(' → ')}`);
console.log('    jobbkk | jobthai | both — เปลี่ยนใน .env หรือเลือกใน popup');
console.log('');

runTalentScrape({
  platform,
  outputDir: join(__dirname, 'output'),
}).catch((error) => {
  console.error('Scrape failed:', error.message);
  process.exit(1);
});
