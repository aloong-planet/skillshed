import { posix } from 'node:path'

export function isInert(path) {
  return path === 'docs' || path.startsWith('docs/') || posix.extname(path).toLowerCase() === '.md'
}
