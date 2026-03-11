/**
 * Workflow data model — Markdown-based reusable prompt templates.
 *
 * A Workflow is a Markdown document that can contain @skill-name placeholders.
 * Unlike Runbooks (button-triggered), Workflows are invocable via @ reference
 * in the chat compose box, making them reusable across conversations.
 */

export interface Workflow {
  id: string
  name: string
  /** Short description — shown in list, search, and @ popover */
  description: string
  /** Markdown content — the prompt template body, may contain @skill-name placeholders */
  content: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Locale-aware prompt serialization
// ---------------------------------------------------------------------------

const promptTemplates = {
  zh: {
    header: '## 工作流',
    requirementsHeader: '## 执行要求',
    instruction: '使用 todowrite 工具创建任务列表来跟踪进度，按顺序执行并更新状态。',
    outputLang: '请使用中文回复。',
  },
  en: {
    header: '## Workflow',
    requirementsHeader: '## Requirements',
    instruction: 'Use the todowrite tool to create a task list to track progress, execute sequentially, and update status as you progress.',
    outputLang: 'Please respond in English.',
  },
} as const

/**
 * Serialize a Workflow to a structured, locale-consistent prompt string.
 * The Markdown content is preserved as-is (including @skill references).
 */
export function serializeWorkflowForPrompt(workflow: Workflow, locale: 'zh' | 'en' = 'zh'): string {
  const tpl = promptTemplates[locale]
  const parts: string[] = []

  parts.push(`${tpl.header}：${workflow.name}`)
  parts.push('')

  if (workflow.content.trim()) {
    parts.push(workflow.content.trim())
  }

  parts.push('')
  parts.push(tpl.requirementsHeader)
  parts.push('')
  parts.push(`- ${tpl.instruction}`)
  parts.push(`- ${tpl.outputLang}`)

  return parts.join('\n')
}
