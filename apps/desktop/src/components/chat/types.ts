import type { MessagePart, RichMessage, TokenInfo } from '../../stores/session'

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

export interface ChatCodeBlockData {
  language: string
  code: string
}

export interface ChatResultData {
  title: string
  subtitle: string
  success?: boolean
}

export interface ChatThreadMessage {
  id: string
  role: ChatRole
  author: string
  timestamp: string
  avatar?: string
  content: string
  streaming?: boolean
  skills?: SkillCardData[]
  codeBlocks?: ChatCodeBlockData[]
  result?: ChatResultData
  // Part-centric extension
  parts?: MessagePart[]
  tokens?: TokenInfo
  cost?: number
  modelInfo?: { providerID: string; modelID: string }
}

export type { MessagePart, RichMessage }
