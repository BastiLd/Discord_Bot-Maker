import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const targets = ['index.html', 'README.md', '.editorconfig', '.gitattributes', 'src', 'docs', 'supabase'];
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json', '.md', '.sql', '.yml', '.yaml']);
const suspiciousPattern = /(?:\u00c3.|\u00c2.|\u00e2\u20ac|\u00f0\u0178|\ufffd)/u;
const failures = [];

function shouldCheck(filePath) {
  const basename = path.basename(filePath);
  return allowedExtensions.has(path.extname(filePath)) || ['README.md', '.editorconfig', '.gitattributes', 'index.html'].includes(basename);
}

function walk(targetPath) {
  const stats = statSync(targetPath);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(targetPath)) {
      walk(path.join(targetPath, entry));
    }
    return;
  }

  if (!shouldCheck(targetPath)) {
    return;
  }

  const content = readFileSync(targetPath, 'utf8');
  if (suspiciousPattern.test(content)) {
    failures.push(path.relative(process.cwd(), targetPath));
  }
}

for (const target of targets) {
  walk(path.resolve(target));
}

if (failures.length) {
  console.error('Encoding check failed. Suspicious mojibake detected in:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Encoding check passed.');
