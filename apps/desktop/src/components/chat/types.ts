import type { MessagePart, RichMessage, TokenInfo } from '../../stores/session'
import type { SessionArtifactSummary, TurnArtifactSummary } from '../../types/artifacts'

export type ChatRole = 'user' | 'ai'

export type SkillStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface SkillCardData {
  id: string
  name: string
  status: SkillStatus
  summary?: string
  input?: string
  output?: string
  icon?: string
}

export interface ChatThreadMessage {
  id: string
  artifactTurnId?: string
  role: ChatRole
  author: string
  timestamp: string
  avatar?: string
  content: string
  streaming?: boolean
  skills?: SkillCardData[]
  parts?: MessagePart[]
  tokens?: TokenInfo
  cost?: number
  modelInfo?: { providerID: string; modelID: string }
}

export type { MessagePart, RichMessage }
export type { SessionArtifactSummary, TurnArtifactSummary }
