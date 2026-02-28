import type { ChatThreadMessage } from '../components/chat'
import type { SkillPanelSkill } from '../components/skills'

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

export type { ChatThreadMessage, SkillPanelSkill }
export type { SessionSummary, RichMessage } from '../stores/session'
