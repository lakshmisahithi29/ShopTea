const { spawnSync } = require('node:child_process');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: __dirname,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to start Prisma CLI:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
