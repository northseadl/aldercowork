export type FileOutcomeStatus = 'processing' | 'added' | 'modified' | 'deleted'
export type FileOutcomeSource = 'live' | 'diff' | 'summary' | 'snapshot' | 'git' | 'attachment'

export interface FileDiffRecord {
  file: string
  before: string
  after: string
  additions: number
  deletions: number
  status?: 'added' | 'deleted' | 'modified'
}

export interface FileOutcome {
  path: string
  status: FileOutcomeStatus
  additions: number
  deletions: number
  before?: string
  after?: string
  messageId: string
  turnId: string
  live: boolean
  source: FileOutcomeSource
  updatedAt: string
  binary?: boolean
  mimeType?: string
  previewTruncated?: boolean
}

export interface TurnArtifactSummary {
  turnId: string
  messageId: string
  files: FileOutcome[]
  completed: boolean
  updatedAt: string
}

export interface SessionArtifactTotals {
  files: number
  additions: number
  deletions: number
  touchedCount: number
}

export interface SessionArtifactSummary {
  files: FileOutcome[]
  totals: SessionArtifactTotals
  error?: string | null
}

export function createEmptySessionArtifactSummary(): SessionArtifactSummary {
  return {
    files: [],
    totals: {
      files: 0,
      additions: 0,
      deletions: 0,
      touchedCount: 0,
    },
    error: null,
  }
}
