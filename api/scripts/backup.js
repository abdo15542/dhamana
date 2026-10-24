// Usage: node api/scripts/backup.js   (env: DHAMANA_DATA_DIR, BACKUP_DIR, BACKUP_KEEP=30)
const fs = require('fs');
const path = require('path');
const dataDir = process.env.DHAMANA_DATA_DIR || path.join(__dirname, '..', 'data');
const src = path.join(dataDir, 'store.json');
const dir = process.env.BACKUP_DIR || path.join(dataDir, 'backups');
const keep = Number(process.env.BACKUP_KEEP) || 30;
if (!fs.existsSync(src)) { console.error('No store.json to back up at', src); process.exit(1); }
JSON.parse(fs.readFileSync(src, 'utf8')); // refuse to back up a corrupt file
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `store-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.copyFileSync(src, file);
fs.chmodSync(file, 0o600);
const all = fs.readdirSync(dir).filter((f) => /^store-.*\.json$/.test(f)).sort();
all.slice(0, Math.max(0, all.length - keep)).forEach((f) => fs.unlinkSync(path.join(dir, f)));
console.log('Backup written:', file, `(${Math.min(all.length, keep)} kept)`);
