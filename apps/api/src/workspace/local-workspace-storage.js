import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultWorkspaceRoot = path.resolve(__dirname, '../../data/workspaces');
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export class LocalWorkspaceStorage {
  constructor(rootDir = process.env.AGENTIM_WORKSPACE_ROOT ?? defaultWorkspaceRoot) {
    this.rootDir = rootDir;
    this.kind = 'local';
  }

  async info(workspaceId) {
    await this.ensureWorkspace(workspaceId);
    return {
      kind: this.kind,
      workspaceId,
      root: this.workspaceRoot(workspaceId)
    };
  }

  async listFiles(workspaceId, requestedPath = '') {
    const dir = this.resolvePath(workspaceId, requestedPath);
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nodes = await Promise.all(entries
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map(async (entry) => {
        const relPath = normalizeRelativePath(path.posix.join(toPosixPath(requestedPath), entry.name));
        const absPath = this.resolvePath(workspaceId, relPath);
        const stat = await fs.stat(absPath);
        return {
          name: entry.name,
          path: relPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stat.size,
          updatedAt: stat.mtime.toISOString()
        };
      }));
    return nodes;
  }

  async readFile(workspaceId, requestedPath) {
    const filePath = this.resolvePath(workspaceId, requestedPath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('path_is_not_file');
    return fs.readFile(filePath, 'utf8');
  }

  async writeFile(workspaceId, requestedPath, content) {
    const filePath = this.resolvePath(workspaceId, requestedPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  async deleteFile(workspaceId, requestedPath) {
    const targetPath = this.resolvePath(workspaceId, requestedPath);
    await fs.rm(targetPath, { recursive: true, force: true });
  }

  async makeDirectory(workspaceId, requestedPath) {
    const dir = this.resolvePath(workspaceId, requestedPath);
    await fs.mkdir(dir, { recursive: true });
  }

  async exportZip(workspaceId, requestedPath = '') {
    await this.ensureWorkspace(workspaceId);
    const rootDir = this.resolvePath(workspaceId, requestedPath);
    const stat = await fs.stat(rootDir);
    if (!stat.isDirectory()) throw new Error('path_is_not_directory');
    const files = await collectFiles(rootDir);
    return createZip(files);
  }

  async ensureWorkspace(workspaceId) {
    await fs.mkdir(this.workspaceRoot(workspaceId), { recursive: true });
  }

  workspaceRoot(workspaceId) {
    return path.join(this.rootDir, sanitizeSegment(workspaceId));
  }

  resolvePath(workspaceId, requestedPath = '') {
    const workspaceRoot = this.workspaceRoot(workspaceId);
    const normalized = normalizeRelativePath(requestedPath);
    const resolved = path.resolve(workspaceRoot, normalized);
    const rootWithSep = `${path.resolve(workspaceRoot)}${path.sep}`;
    if (resolved !== path.resolve(workspaceRoot) && !resolved.startsWith(rootWithSep)) {
      throw new Error('invalid_workspace_path');
    }
    return resolved;
  }
}

export function normalizeRelativePath(value) {
  const raw = String(value ?? '').replaceAll('\\', '/').trim();
  if (!raw || raw === '.') return '';
  if (raw.startsWith('/')) throw new Error('absolute_paths_not_allowed');
  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('parent_paths_not_allowed');
  return normalized === '.' ? '' : normalized;
}

function sanitizeSegment(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function toPosixPath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

async function collectFiles(rootDir, currentDir = '') {
  const absDir = path.join(rootDir, currentDir);
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relPath = normalizeRelativePath(path.posix.join(toPosixPath(currentDir), entry.name));
    const absPath = path.join(rootDir, relPath);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(rootDir, relPath));
    } else if (entry.isFile()) {
      files.push({
        path: relPath,
        bytes: await fs.readFile(absPath)
      });
    }
  }
  return files;
}

function createZip(files) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = textEncoder.encode(file.path);
    const data = file.bytes instanceof Uint8Array ? file.bytes : textEncoder.encode(String(file.bytes));
    const crc = crc32(data);
    const { time, date } = dosDateTime(new Date());
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    chunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralDirectory.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const header of centralDirectory) {
    chunks.push(header);
    centralSize += header.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  chunks.push(end);

  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function dosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}
