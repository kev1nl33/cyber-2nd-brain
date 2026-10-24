import { readdir } from 'node:fs/promises';

// Node 22 的目录入口需要显式聚合 .mjs 测试。
const names = (await readdir(new URL('./', import.meta.url)))
  .filter(name => /^test-.*\.mjs$/.test(name)).sort();
for (const name of names) await import(new URL(name, import.meta.url));
