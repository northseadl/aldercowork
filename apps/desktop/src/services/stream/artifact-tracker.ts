import type { MessagePart, FileInfo } from '../../stores/session'
import type {
  FileDiffRecord,
  FileOutcome,
  FileOutcomeSource,
  SessionArtifactSummary,
  TurnArtifactSummary,
} from '../../types/artifacts'

import { asRecord, asString, normalizeError, nowISO } from './helpers'

type ClientRecord = Record<string, unknown>
type GitStatus = 'added' | 'deleted' | 'modified'

interface GitStatusRecord {
  path: string
  status: GitStatus
  additions: number
  deletions: number
}

export interface ArtifactBaseline {
  capturedAt: string
  paths: Set<string>
  snapshotAvailable: boolean
  gitStatus: Map<string, GitStatusRecord>
  gitAvailable: boolean
  snapshotTruncated: boolean
}

export interface ResolveTurnArtifactsOptions {
  client: ClientRecord
  sessionId: string
  turnId: string
  messageId: string
  userMessageId?: string | null
  baseline: ArtifactBaseline | null
  liveFiles?: FileOutcome[]
  attachmentFiles?: FileOutcome[]
}

export interface ResolveTurnArtifactsResult {
  files: FileOutcome[]
  warnings: string[]
}

const ROOT_PATH_CANDIDATES = ['', '.']
const SNAPSHOT_MAX_FILES = 2000
const SNAPSHOT_IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
])

const ARTIFACT_SETTLE_MS = 180
const SOURCE_PRIORITY: Record<FileOutcomeSource, number> = {
  summary: 0,
  live: 1,
  attachment: 2,
  snapshot: 3,
  git: 4,
  diff: 5,
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isGitStatus(value: unknown): value is GitStatus {
  return value === 'added' || value === 'deleted' || value === 'modified'
}

function sourcePriority(source: FileOutcomeSource): number {
  return SOURCE_PRIORITY[source] ?? 0
}

function cloneOutcome(outcome: FileOutcome): FileOutcome {
  return { ...outcome }
}

/**
 * Normalize workspace-relative paths so that different representations
 * of the same file (e.g. `./foo.md` vs `foo.md`, backslashes on Windows)
 * always produce the same Map key.
 */
function normalizePath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/$/, '')
}

function normalizeOutcomeStatus(status: FileDiffRecord['status'] | undefined): FileOutcome['status'] {
  if (status === 'added' || status === 'deleted' || status === 'modified') return status
  return 'modified'
}

function extractArrayResponse<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  const result = asRecord(raw)
  if (Array.isArray(result.data)) return result.data as T[]
  return []
}

async function listDirectory(client: ClientRecord, path: string, isRoot = false): Promise<Array<Record<string, unknown>>> {
  const fileNs = asRecord(client.file)
  if (typeof fileNs.list !== 'function') return []

  const candidates = isRoot ? ROOT_PATH_CANDIDATES : [path]
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const response = await (fileNs.list as (opts: unknown) => Promise<unknown>)({ path: candidate })
      const result = asRecord(response)
      if (result.error) {
        lastError = result.error
        continue
      }
      return extractArrayResponse<Record<string, unknown>>(response)
    } catch (error: unknown) {
      lastError = error
    }
  }

  if (lastError) throw lastError
  return []
}

async function collectWorkspacePaths(client: ClientRecord): Promise<{ paths: Set<string>; truncated: boolean }> {
  const discovered = new Set<string>()
  const queue: Array<{ path: string; root: boolean }> = [{ path: '', root: true }]
  let truncated = false

  while (queue.length > 0) {
    if (discovered.size >= SNAPSHOT_MAX_FILES) {
      truncated = true
      break
    }

    const current = queue.pop()!
    let entries: Array<Record<string, unknown>> = []
    try {
      entries = await listDirectory(client, current.path, current.root)
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = asString(entry.path)
      const entryType = asString(entry.type)
      const ignored = entry.ignored === true
      if (!entryPath || !entryType || ignored) continue

      const leaf = basename(entryPath)
      if (SNAPSHOT_IGNORED_DIRS.has(leaf)) continue

      if (entryType === 'directory') {
        queue.push({ path: entryPath, root: false })
        continue
      }

      discovered.add(normalizePath(entryPath))
      if (discovered.size >= SNAPSHOT_MAX_FILES) {
        truncated = true
        break
      }
    }
  }

  return { paths: discovered, truncated }
}

async function collectGitStatus(client: ClientRecord): Promise<{ available: boolean; map: Map<string, GitStatusRecord> }> {
  const fileNs = asRecord(client.file)
  if (typeof fileNs.status !== 'function') {
    return { available: false, map: new Map() }
  }

  try {
    const response = await (fileNs.status as (opts?: unknown) => Promise<unknown>)({})
    const result = asRecord(response)
    if (result.error) return { available: false, map: new Map() }

    const statusMap = new Map<string, GitStatusRecord>()
    for (const item of extractArrayResponse<Record<string, unknown>>(response)) {
      const rawPath = asString(item.path)
      const status = item.status
      if (!rawPath || !isGitStatus(status)) continue
      const path = normalizePath(rawPath)
      statusMap.set(path, {
        path,
        status,
        additions: Number(item.added) || 0,
        deletions: Number(item.removed) || 0,
      })
    }

    return { available: true, map: statusMap }
  } catch {
    return { available: false, map: new Map() }
  }
}

function parseSessionDiff(raw: unknown): FileDiffRecord[] {
  return extractArrayResponse<Record<string, unknown>>(raw)
    .map(parseFileDiffRecord)
    .filter((item): item is FileDiffRecord => item !== null)
}

async function fetchSessionDiff(
  client: ClientRecord,
  sessionId: string,
  userMessageId?: string | null,
): Promise<FileDiffRecord[]> {
  const sessionNs = asRecord(client.session)
  if (typeof sessionNs.diff !== 'function') return []

  const response = await (sessionNs.diff as (opts: unknown) => Promise<unknown>)({
    sessionID: sessionId,
    messageID: userMessageId ?? undefined,
  })
  const result = asRecord(response)
  if (result.error) {
    throw new Error(normalizeError(result.error))
  }
  return parseSessionDiff(response)
}

function mergeOutcome(current: FileOutcome | undefined, incoming: FileOutcome): FileOutcome {
  if (!current) return cloneOutcome(incoming)

  const currentPriority = sourcePriority(current.source)
  const incomingPriority = sourcePriority(incoming.source)
  const dominant = incomingPriority >= currentPriority ? incoming : current
  const fallback = dominant === incoming ? current : incoming

  return {
    ...fallback,
    ...dominant,
  }
}

function finalizeOutcome(outcome: FileOutcome): FileOutcome {
  if (outcome.status === 'processing') {
    return {
      ...outcome,
      status: 'modified',
      live: false,
      updatedAt: nowISO(),
    }
  }

  return {
    ...outcome,
    live: false,
  }
}

function createGitOutcome(record: GitStatusRecord, turnId: string, messageId: string): FileOutcome {
  return {
    path: normalizePath(record.path),
    status: normalizeOutcomeStatus(record.status),
    additions: record.additions,
    deletions: record.deletions,
    messageId,
    turnId,
    live: false,
    source: 'git',
    updatedAt: nowISO(),
  }
}

function createSnapshotOutcome(
  path: string,
  status: 'added' | 'deleted',
  turnId: string,
  messageId: string,
): FileOutcome {
  return {
    path: normalizePath(path),
    status,
    additions: 0,
    deletions: 0,
    messageId,
    turnId,
    live: false,
    source: 'snapshot',
    updatedAt: nowISO(),
  }
}

function mergeScopedDiffs(
  filesByPath: Map<string, FileOutcome>,
  diffs: FileOutcome[],
  scopedByMessage: boolean,
): { skippedUnscoped: boolean } {
  if (scopedByMessage) {
    for (const diff of diffs) {
      filesByPath.set(diff.path, mergeOutcome(filesByPath.get(diff.path), diff))
    }
    return { skippedUnscoped: false }
  }

  let skippedUnscoped = false
  for (const diff of diffs) {
    if (!filesByPath.has(diff.path)) {
      skippedUnscoped = true
      continue
    }
    filesByPath.set(diff.path, mergeOutcome(filesByPath.get(diff.path), diff))
  }
  return { skippedUnscoped }
}

function diffGitStatus(
  before: Map<string, GitStatusRecord>,
  after: Map<string, GitStatusRecord>,
  turnId: string,
  messageId: string,
): FileOutcome[] {
  const changed = new Set<string>([...before.keys(), ...after.keys()])
  const outcomes: FileOutcome[] = []

  for (const path of changed) {
    const previous = before.get(path)
    const next = after.get(path)

    if (!previous && next) {
      outcomes.push(createGitOutcome(next, turnId, messageId))
      continue
    }

    if (previous && !next) {
      outcomes.push(createSnapshotOutcome(path, 'deleted', turnId, messageId))
      continue
    }

    if (!previous || !next) continue
    if (
      previous.status !== next.status
      || previous.additions !== next.additions
      || previous.deletions !== next.deletions
    ) {
      outcomes.push(createGitOutcome(next, turnId, messageId))
    }
  }

  return outcomes
}

function diffPathSnapshots(
  before: Set<string>,
  after: Set<string>,
  turnId: string,
  messageId: string,
): FileOutcome[] {
  const outcomes: FileOutcome[] = []

  for (const path of after) {
    if (!before.has(path)) {
      outcomes.push(createSnapshotOutcome(path, 'added', turnId, messageId))
    }
  }

  for (const path of before) {
    if (!after.has(path)) {
      outcomes.push(createSnapshotOutcome(path, 'deleted', turnId, messageId))
    }
  }

  return outcomes
}

export function parseFileDiffRecord(source: unknown): FileDiffRecord | null {
  const rec = asRecord(source)
  const file = asString(rec.file)
  if (!file) return null

  const status = rec.status
  return {
    file,
    additions: Number(rec.additions) || 0,
    deletions: Number(rec.deletions) || 0,
    status: isGitStatus(status) ? status : undefined,
  }
}

export function createProcessingOutcome(path: string, turnId: string, messageId: string): FileOutcome {
  return {
    path: normalizePath(path),
    status: 'processing',
    additions: 0,
    deletions: 0,
    messageId,
    turnId,
    live: true,
    source: 'live',
    updatedAt: nowISO(),
  }
}

export function createOutcomeFromDiff(
  diff: FileDiffRecord,
  turnId: string,
  messageId: string,
  source: FileOutcomeSource,
): FileOutcome {
  return {
    path: normalizePath(diff.file),
    status: normalizeOutcomeStatus(diff.status),
    additions: diff.additions,
    deletions: diff.deletions,
    messageId,
    turnId,
    live: source === 'live',
    source,
    updatedAt: nowISO(),
  }
}

export function createOutcomeFromAttachment(file: FileInfo, turnId: string, messageId: string): FileOutcome | null {
  const raw = file.path ?? file.filename
  if (!raw) return null
  const path = normalizePath(raw)

  return {
    path,
    status: 'added',
    additions: 0,
    deletions: 0,
    messageId,
    turnId,
    live: false,
    source: 'attachment',
    updatedAt: nowISO(),
  }
}

export function extractAttachmentOutcomes(parts: MessagePart[], turnId: string, messageId: string): FileOutcome[] {
  const files: FileOutcome[] = []

  for (const part of parts) {
    for (const attachment of part.tool?.attachments ?? []) {
      const outcome = createOutcomeFromAttachment(attachment, turnId, messageId)
      if (outcome) files.push(outcome)
    }
  }

  return files
}

export function extractToolAttachmentOutcomes(tool: { attachments?: FileInfo[] } | undefined, turnId: string, messageId: string): FileOutcome[] {
  if (!tool?.attachments?.length) return []
  return tool.attachments
    .map((attachment) => createOutcomeFromAttachment(attachment, turnId, messageId))
    .filter((item): item is FileOutcome => item !== null)
}

export function mergeOutcomes(existing: FileOutcome | undefined, incoming: FileOutcome): FileOutcome {
  return mergeOutcome(existing, incoming)
}

export function buildSessionArtifactSummary(
  restored: FileOutcome[],
  turns: Record<string, TurnArtifactSummary>,
  error: string | null,
): SessionArtifactSummary {
  const merged = new Map<string, FileOutcome>()
  const touches = [...restored, ...Object.values(turns).flatMap((turn) => turn.files)]
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())

  for (const item of touches) {
    const path = normalizePath(item.path)
    const entry = path === item.path ? item : { ...item, path }
    merged.set(path, mergeOutcome(merged.get(path), entry))
  }

  const files = [...merged.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  return {
    files,
    totals: {
      files: files.length,
      additions: files.reduce((sum, item) => sum + item.additions, 0),
      deletions: files.reduce((sum, item) => sum + item.deletions, 0),
    },
    error,
  }
}

export async function captureArtifactBaseline(client: ClientRecord): Promise<ArtifactBaseline | null> {
  let paths = new Set<string>()
  let snapshotAvailable = false
  let snapshotTruncated = false

  try {
    const snapshot = await collectWorkspacePaths(client)
    paths = snapshot.paths
    snapshotAvailable = true
    snapshotTruncated = snapshot.truncated
  } catch {
    paths = new Set<string>()
  }

  const git = await collectGitStatus(client)

  if (!snapshotAvailable && !git.available) {
    return null
  }

  return {
    capturedAt: nowISO(),
    paths,
    snapshotAvailable,
    gitStatus: git.map,
    gitAvailable: git.available,
    snapshotTruncated,
  }
}

export async function resolveTurnArtifacts(options: ResolveTurnArtifactsOptions): Promise<ResolveTurnArtifactsResult> {
  const warnings: string[] = []
  const filesByPath = new Map<string, FileOutcome>()
  const mergeMany = (items: FileOutcome[]) => {
    for (const item of items) {
      filesByPath.set(item.path, mergeOutcome(filesByPath.get(item.path), item))
    }
  }

  mergeMany(options.liveFiles ?? [])
  mergeMany(options.attachmentFiles ?? [])

  if (options.baseline?.snapshotAvailable && options.baseline.snapshotTruncated) {
    warnings.push(`snapshot: baseline limited to ${SNAPSHOT_MAX_FILES} files`)
  }

  await sleep(ARTIFACT_SETTLE_MS)

  let diffOutcomes: FileOutcome[] = []
  try {
    const diffs = await fetchSessionDiff(options.client, options.sessionId, options.userMessageId)
    diffOutcomes = diffs.map((item) => createOutcomeFromDiff(item, options.turnId, options.messageId, 'diff'))
  } catch (error: unknown) {
    warnings.push(`session.diff: ${normalizeError(error)}`)
  }

  if (options.baseline?.gitAvailable) {
    const git = await collectGitStatus(options.client)
    if (git.available) {
      mergeMany(diffGitStatus(options.baseline.gitStatus, git.map, options.turnId, options.messageId))
    }
  }

  try {
    if (options.baseline?.snapshotAvailable) {
      const postSnapshot = await collectWorkspacePaths(options.client)
      if (postSnapshot.truncated) {
        warnings.push(`snapshot: follow-up scan limited to ${SNAPSHOT_MAX_FILES} files`)
      }
      mergeMany(diffPathSnapshots(options.baseline.paths, postSnapshot.paths, options.turnId, options.messageId))
    }
  } catch (error: unknown) {
    warnings.push(`snapshot: ${normalizeError(error)}`)
  }

  if (diffOutcomes.length > 0) {
    const diffMerge = mergeScopedDiffs(filesByPath, diffOutcomes, Boolean(options.userMessageId))
    if (diffMerge.skippedUnscoped) {
      warnings.push('session.diff: skipped unscoped paths without a turn-local signal')
    }
  }

  const files = [...filesByPath.values()]
    .map(finalizeOutcome)
    .sort((a, b) => a.path.localeCompare(b.path))

  return { files, warnings }
}
