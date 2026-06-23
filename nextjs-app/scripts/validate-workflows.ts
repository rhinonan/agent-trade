import { WorkflowYamlSchema } from '../lib/role-loader/schema';
import fs from 'fs';
import { load as parseYaml } from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dir = path.resolve(__dirname, '..', '..', 'roles', 'workflows');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
let errors = 0;
for (const f of files) {
  try {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
    const parsed = parseYaml(raw);
    WorkflowYamlSchema.parse(parsed);
    console.log('✓', f);
  } catch (e) {
    console.error('✗', f, (e as Error).message);
    errors++;
  }
}
console.log(errors === 0 ? 'All valid!' : errors + ' errors');
process.exit(errors > 0 ? 1 : 0);
