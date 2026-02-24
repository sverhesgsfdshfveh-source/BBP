import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('dist/console');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'README.txt'), 'Console implementation is API-driven in src/console.');
console.log('console assets prepared at', out);
