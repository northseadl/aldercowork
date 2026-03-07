/**
 * Runbook data model — simplified to body + ordered step list.
 *
 * Users are non-technical; they don't know markdown syntax.
 * A Runbook describes a task (body) and an ordered list of steps (todos)
 * for an agent to execute sequentially.
 */

export interface RunbookStep {
  id: string
  text: string
  checked: boolean
}

export interface Runbook {
  id: string
  name: string
  /** Free-form task description — plain text, no markdown knowledge required */
  body: string
  /** Ordered step list — agent executes these sequentially */
  steps: RunbookStep[]
  createdAt: string
  updatedAt: string
}

let _stepCounter = 0

export function createStepId(): string {
  return `step-${Date.now()}-${++_stepCounter}`
}

// ---------------------------------------------------------------------------
// Legacy migration: convert old `content`-based Runbook to new body+steps model
// ---------------------------------------------------------------------------

interface LegacyRunbook {
  id: string
  name: string
  content?: string
  body?: string
  steps?: RunbookStep[]
  createdAt: string
  updatedAt: string
}

/**
 * Migrate a legacy Runbook (single `content` string with markdown)
 * to the new { body, steps } model. Idempotent — already-migrated
 * runbooks pass through unchanged.
 */
export function migrateRunbook(raw: LegacyRunbook): Runbook {
  // Already migrated
  if (raw.body !== undefined || raw.steps !== undefined) {
    return {
      id: raw.id,
      name: raw.name,
      body: raw.body ?? '',
      steps: raw.steps ?? [],
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }
  }

  // Parse legacy content string
  const content = raw.content ?? ''
  const lines = content.split('\n')
  const bodyLines: string[] = []
  const steps: RunbookStep[] = []

  const todoPattern = /^- \[([ xX])\]\s*(.*)/

  for (const line of lines) {
    const match = todoPattern.exec(line)
    if (match) {
      steps.push({
        id: createStepId(),
        text: match[2].trim(),
        checked: match[1].toLowerCase() === 'x',
      })
    } else {
      bodyLines.push(line)
    }
  }

  // Strip heading markers for non-technical users
  const body = bodyLines
    .map((l) => l.replace(/^#{1,6}\s+/, ''))
    .join('\n')
    .trim()

  return {
    id: raw.id,
    name: raw.name,
    body,
    steps,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

/**
 * Serialize a Runbook to a prompt string that an agent can execute.
 * Instructs the agent to use todowrite for progress tracking.
 */
export function serializeForPrompt(runbook: Runbook): string {
  const parts: string[] = []

  if (runbook.body.trim()) {
    parts.push(runbook.body.trim())
  }

  if (runbook.steps.length > 0) {
    parts.push('')
    parts.push('Steps to execute in order:')
    for (let i = 0; i < runbook.steps.length; i++) {
      const step = runbook.steps[i]
      if (step.text.trim()) {
        parts.push(`${i + 1}. ${step.text.trim()}`)
      }
    }
    parts.push('')
    parts.push(
      'Use the todowrite tool to create a task list from the steps above, ' +
      'then execute each step sequentially, updating the status as you progress.',
    )
  }

  return parts.join('\n')
}
