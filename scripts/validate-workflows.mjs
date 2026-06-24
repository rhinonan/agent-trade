import { WorkflowYamlSchema } from '../lib/role-loader/schema.js';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '..', '..', 'roles', 'workflows');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
let errors = 0;
for (const f of files) {
  try {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
    const parsed = yaml.load(raw);
    WorkflowYamlSchema.parse(parsed);
    console.log('✓', f);
  } catch (e) {
    console.error('✗', f, e.message);
    errors++;
  }
}
console.log(errors === 0 ? 'All valid!' : errors + ' errors');
process.exit(errors > 0 ? 1 : 0);
