<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import ArtifactBand from './ArtifactBand.vue'
import ArtifactShelf from './ArtifactShelf.vue'
import ChatMessage from './ChatMessage.vue'
import StreamingMarkdown from './StreamingMarkdown.vue'
import SkillCard from './SkillCard.vue'

import { FileAttachment, PatchDiff, ReasoningBlock, RetryNotice, TokenStats } from './parts'

import { useI18n } from '../../i18n'
import type { ChatThreadMessage, MessagePart, SessionArtifactSummary, TurnArtifactSummary } from './types'

const { t } = useI18n()

const props = defineProps<{
  messages: ChatThreadMessage[]
  turnArtifactsByTurnId?: Record<string, TurnArtifactSummary>
  sessionArtifactSummary?: SessionArtifactSummary
}>()

const conversationRef = ref<HTMLElement | null>(null)
const isUserScrolledUp = ref(false)

// ---------------------------------------------------------------------------
// Visible part — a part that should be rendered in the UI
// ---------------------------------------------------------------------------

type VisiblePartType = 'text' | 'reasoning' | 'file' | 'tool' | 'patch' | 'retry' | 'command' | 'unknown'

interface VisiblePart {
  part: MessagePart
  vtype: VisiblePartType
}

const HIDDEN_TYPES = new Set(['step-start', 'step-finish', 'snapshot', 'agent', 'compaction', 'subtask'])

interface FormattedMessage extends ChatThreadMessage {
  /** Parts in original order, filtered and typed for rendering */
  visibleParts: VisiblePart[]
  /** Whether there is any visible activity that should replace the thinking dots. */
  hasVisibleActivity: boolean
  /** Model label for display (e.g. "anthropic · claude-sonnet-4-20250514") */
  modelLabel: string | undefined
  artifactSummary?: TurnArtifactSummary
}

function classifyPartType(type: string | undefined): VisiblePartType | null {
  if (!type) return null
  if (HIDDEN_TYPES.has(type)) return null
  if (type === 'text' || type === 'reasoning' || type === 'file' || type === 'tool' || type === 'patch' || type === 'retry' || type === 'command') {
    return type
  }
  return 'unknown'
}

/**
 * Compute rendered data per message.
 * Markdown rendering is delegated to StreamingMarkdown component —
 * no markdown work happens here, eliminating the double-render overhead.
 */
const formattedMessages = computed<FormattedMessage[]>(() => {

  return props.messages.map((message) => {
    const visibleParts: VisiblePart[] = []
    let hasVisibleActivity = false

    for (const part of message.parts ?? []) {
      const vtype = classifyPartType(part.type)
      if (vtype === null) continue

      const vp: VisiblePart = { part, vtype }
      if (!hasVisibleActivity) {
        if (vtype === 'text' || vtype === 'reasoning') {
          hasVisibleActivity = !!part.text?.trim()
        } else {
          hasVisibleActivity = true
        }
      }
      visibleParts.push(vp)
    }

    const modelLabel = message.modelInfo
      ? `${message.modelInfo.providerID} · ${message.modelInfo.modelID}`
      : undefined

    return {
      ...message,
      visibleParts,
      hasVisibleActivity,
      modelLabel,
      artifactSummary: props.turnArtifactsByTurnId?.[message.artifactTurnId ?? message.id],
    }
  })
})

const lastMessage = computed(() => props.messages[props.messages.length - 1] ?? null)

const lastTurnArtifact = computed(() => {
  const turnId = lastMessage.value?.artifactTurnId
  return turnId ? props.turnArtifactsByTurnId?.[turnId] ?? null : null
})

function partRenderSignature(part: MessagePart): string {
  if (part.type === 'text' || part.type === 'reasoning') {
    return `${part.type}:${part.text?.length ?? 0}`
  }
  if (part.type === 'tool') {
    return `${part.type}:${part.tool?.status ?? 'pending'}:${part.tool?.title?.length ?? 0}:${part.tool?.output?.length ?? 0}`
  }
  if (part.type === 'file') {
    return `${part.type}:${part.file?.filename?.length ?? 0}:${part.file?.url?.length ?? 0}`
  }
  if (part.type === 'patch') {
    return `${part.type}:${part.patch?.hash ?? ''}:${part.patch?.files.length ?? 0}`
  }
  if (part.type === 'retry') {
    return `${part.type}:${part.retry?.attempt ?? 0}:${part.retry?.error?.length ?? 0}`
  }
  if (part.type === 'command') {
    return `${part.type}:${part.command?.name ?? ''}`
  }
  return part.type
}

function messageRenderSignature(message: ChatThreadMessage | null): string {
  if (!message) return ''
  return [
    message.id,
    message.streaming ? 'streaming' : 'steady',
    (message.parts ?? []).length,
    (message.parts ?? []).map(partRenderSignature).join('|'),
  ].join(':')
}

const handleScroll = () => {
  const el = conversationRef.value
  if (!el) return
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 20
  isUserScrolledUp.value = !isAtBottom
}

const scrollToBottom = async (force = false) => {
  await nextTick()
  const el = conversationRef.value
  if (!el) return
  if (isUserScrolledUp.value && !force) return
  el.scrollTop = el.scrollHeight
}

watch(
  [
    () => props.messages.length,
    () => messageRenderSignature(lastMessage.value),
    () => lastTurnArtifact.value?.updatedAt ?? '',
    () => lastTurnArtifact.value?.files.length ?? 0,
    () => props.sessionArtifactSummary?.files.length ?? 0,
    () => props.sessionArtifactSummary?.error ?? '',
  ],
  () => { void scrollToBottom() },
)

onMounted(() => { void scrollToBottom(true) })
</script>

<template>
  <section class="chat-thread">
    <div ref="conversationRef" class="conversation" @scroll="handleScroll">
      <div class="thread">
        <ChatMessage
          v-for="message in formattedMessages"
          :key="message.id"
          :role="message.role"
          :author="message.author"
          :timestamp="message.timestamp"
          :avatar="message.avatar"
          :model-label="message.role === 'ai' ? message.modelLabel : undefined"
        >
          <!-- Thinking indicator (only before any visible activity arrives) -->
          <div v-if="message.streaming && !message.hasVisibleActivity" class="thinking">
            <span class="thinking-dot" />
            <span class="thinking-dot" />
            <span class="thinking-dot" />
          </div>

          <!-- Parts rendered in ORIGINAL ORDER -->
          <template v-for="vp in message.visibleParts" :key="vp.part.id">
            <!-- Reasoning block -->
            <ReasoningBlock
              v-if="vp.vtype === 'reasoning'"
              :text="vp.part.text"
              :streaming="message.streaming"
            />

            <!-- Text content — StreamingMarkdown handles both streaming and static -->
            <StreamingMarkdown
              v-else-if="vp.vtype === 'text'"
              :text="vp.part.text ?? ''"
              :streaming="!!message.streaming"
            />

            <!-- File attachment -->
            <FileAttachment
              v-else-if="vp.vtype === 'file'"
              :file="vp.part.file"
              :direction="message.role === 'user' ? 'input' : 'output'"
            />

            <!-- Tool call -->
            <div v-else-if="vp.vtype === 'tool'" class="skill-cards">
              <SkillCard
                :id="vp.part.tool?.id ?? vp.part.id"
                :name="vp.part.tool?.name ?? 'tool'"
                :status="vp.part.tool?.status ?? 'pending'"
                :summary="vp.part.tool?.title"
                :input="vp.part.tool?.input"
                :output="vp.part.tool?.output"
              />
            </div>

            <!-- Patch diff -->
            <PatchDiff
              v-else-if="vp.vtype === 'patch'"
              :patch="vp.part.patch"
            />

            <!-- Retry notice -->
            <RetryNotice
              v-else-if="vp.vtype === 'retry'"
              :retry="vp.part.retry"
            />

            <!-- Command/skill reference chip -->
            <div v-else-if="vp.vtype === 'command'" class="command-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span class="command-chip__name">{{ vp.part.command?.name }}</span>
            </div>

            <!-- Unknown part (debug fallback) -->
            <div v-else-if="vp.vtype === 'unknown'" class="unknown-part">
              <span class="unknown-part-label">{{ t('chat.unknownPart.label') }}: {{ vp.part.type }}</span>
              <span class="unknown-part-desc">{{ t('chat.unknownPart.description') }}</span>
            </div>
          </template>

          <ArtifactBand
            v-if="message.role === 'ai' && message.artifactSummary && message.artifactSummary.files.length > 0"
            :summary="message.artifactSummary"
          />

          <!-- Token stats (for assistant messages) -->
          <TokenStats
            v-if="message.role === 'ai' && !message.streaming && (message.tokens || message.cost)"
            :tokens="message.tokens"
            :cost="message.cost"
          />
        </ChatMessage>

        <ArtifactShelf
          v-if="props.sessionArtifactSummary && (props.sessionArtifactSummary.files.length > 0 || props.sessionArtifactSummary.error)"
          :summary="props.sessionArtifactSummary"
        />
      </div>
    </div>

    <div v-if="$slots.compose" class="compose-slot">
      <slot name="compose" />
    </div>
  </section>
</template>

<style scoped>
.chat-thread {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.conversation {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--sp) * 3) 0;
}

.thread {
  max-width: 680px;
  margin: 0 auto;
  padding: 0 calc(var(--sp) * 4);
}

.skill-cards {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: calc(var(--sp) * 1) 0;
}

.unknown-part {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  border: 1px dashed color-mix(in srgb, var(--brand) 30%, var(--border));
  background: color-mix(in srgb, var(--brand) 5%, var(--surface-card));
  margin: calc(var(--sp) * 1.25) 0;
}

.unknown-part-label {
  font-size: var(--text-micro);
  font-family: var(--font-mono);
  color: var(--text-2);
}

.unknown-part-desc {
  font-size: var(--text-micro);
  color: var(--text-3);
}

.compose-slot {
  flex-shrink: 0;
}

/* ── Command/skill chip in user message ── */
.command-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px 3px 7px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 25%, transparent);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  color: var(--text-1);
  margin: 4px 0;
}

.command-chip svg {
  color: var(--color-warning, #f59e0b);
  flex-shrink: 0;
}

.command-chip__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Thinking dots (before text arrives) ── */
@keyframes thinking-pulse {
  0%, 80%, 100% { opacity: 0.25; }
  40% { opacity: 1; }
}

.thinking {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
}

.thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
  animation: thinking-pulse 1.4s ease-in-out infinite;
}

.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }
</style>
