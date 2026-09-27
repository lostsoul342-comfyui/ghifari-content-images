import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.log']);
const MAX_TEXT_BYTES = 4000; // per file, so context doesn't explode

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // missing drive, permissions, etc. — skip quietly
  }
}

function walk(rootDir, maxDepth, maxFiles, out) {
  const stack = [{ dir: rootDir, depth: 0 }];
  while (stack.length && out.files.length < maxFiles) {
    const { dir, depth } = stack.pop();
    if (depth > maxDepth) continue;
    for (const entry of safeReadDir(dir)) {
      if (out.files.length >= maxFiles) break;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile()) {
        out.files.push(full);
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext)) {
          try {
            const buf = fs.readFileSync(full);
            out.textSnippets.push({
              path: full,
              content: buf.subarray(0, MAX_TEXT_BYTES).toString('utf8'),
            });
          } catch {
            // unreadable file, skip
          }
        }
      }
    }
  }
}

/**
 * Builds a bounded text summary of local files for use as LLM context.
 * Scans LOCAL_KNOWLEDGE_PATHS (comma-separated absolute paths) plus any
 * extraPaths passed in (e.g. this repo's images/videos folders).
 */
export function buildLocalKnowledge({ extraPaths = [] } = {}) {
  const configuredPaths = (process.env.LOCAL_KNOWLEDGE_PATHS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const maxDepth = Number(process.env.LOCAL_KNOWLEDGE_MAX_DEPTH || 3);
  const maxFiles = Number(process.env.LOCAL_KNOWLEDGE_MAX_FILES || 500);

  const roots = [...configuredPaths, ...extraPaths];
  const out = { files: [], textSnippets: [] };

  for (const root of roots) {
    walk(root, maxDepth, maxFiles, out);
  }

  if (out.files.length === 0) {
    return 'No local files found (LOCAL_KNOWLEDGE_PATHS is empty or the configured folders were not reachable).';
  }

  const fileList = out.files.map((f) => `- ${f}`).join('\n');
  const snippets = out.textSnippets
    .map((s) => `### ${s.path}\n${s.content}`)
    .join('\n\n');

  return [
    `Known local files (${out.files.length}${out.files.length >= maxFiles ? '+' : ''}):`,
    fileList,
    snippets ? '\n\nContents of small text files found above:\n' + snippets : '',
  ].join('\n');
}
