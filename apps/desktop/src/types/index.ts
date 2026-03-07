import type { ChatThreadMessage } from '../components/chat'


export type AppNavId = 'sessions' | 'skills' | 'runbooks' | 'settings'

export interface BreadcrumbItem {
  label: string
  current?: boolean
}

export interface SidebarNavItem {
  id: AppNavId
  label: string
  icon: string
  count?: number
  shortcut?: string
}

// Runtime error protocol — shared between main.ts (emitter) and App.vue (receiver)
export const RUNTIME_ERROR_EVENT = 'aldercowork:runtime-error'
export type RuntimeErrorSource = 'vue' | 'window' | 'promise' | 'router'
export interface RuntimeErrorDetail {
  source: RuntimeErrorSource
  message: string
  stack?: string
  timestamp: string
}

export type { ChatThreadMessage }
export type { SessionSummary, RichMessage } from '../stores/session'
export type {
  FileDiffRecord,
  FileOutcome,
  FileOutcomeSource,
  FileOutcomeStatus,
  SessionArtifactSummary,
  SessionArtifactTotals,
  TurnArtifactSummary,
} from './artifacts'
