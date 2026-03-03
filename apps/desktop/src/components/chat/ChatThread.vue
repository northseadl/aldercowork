<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import ChatMessage from './ChatMessage.vue'
import StreamingMarkdown from './StreamingMarkdown.vue'
import SkillCard from './SkillCard.vue'

import { FileAttachment, PatchDiff, ReasoningBlock, RetryNotice, TokenStats } from './parts'

import { useI18n } from '../../i18n'
import type { ChatThreadMessage, MessagePart } from './types'

const { t } = useI18n()

const props = defineProps<{
  messages: ChatThreadMessage[]
}>()

const conversationRef = ref<HTMLElement | null>(null)
const isUserScrolledUp = ref(false)

// ---------------------------------------------------------------------------
// Visible part — a part that should be rendered in the UI
// ---------------------------------------------------------------------------

type VisiblePartType = 'text' | 'reasoning' | 'file' | 'tool' | 'patch' | 'retry' | 'unknown'

interface VisiblePart {
  part: MessagePart
  vtype: VisiblePartType
}

const HIDDEN_TYPES = new Set(['step-start', 'step-finish', 'snapshot', 'agent', 'compaction', 'subtask'])

interface FormattedMessage extends ChatThreadMessage {
  /** Parts in original order, filtered and typed for rendering */
  visibleParts: VisiblePart[]
  /** Whether there is any text content (for thinking indicator) */
  hasText: boolean
  /** Model label for display (e.g. "anthropic · claude-sonnet-4-20250514") */
  modelLabel: string | undefined
}

function classifyPartType(type: string | undefined): VisiblePartType | null {
  if (!type) return null
  if (HIDDEN_TYPES.has(type)) return null
  if (type === 'text' || type === 'reasoning' || type === 'file' || type === 'tool' || type === 'patch' || type === 'retry') {
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
    let hasText = false

    for (const part of message.parts ?? []) {
      const vtype = classifyPartType(part.type)
      if (vtype === null) continue

      const vp: VisiblePart = { part, vtype }
      if (vtype === 'text') hasText = hasText || !!(part.text?.trim())
      visibleParts.push(vp)
    }

    // Fallback: if no parts but we have legacy content string
    if (!hasText && message.content) {
      hasText = true
      visibleParts.push({
        part: { id: `${message.id}-legacy`, type: 'text', text: message.content },
        vtype: 'text',
      })
    }

    const modelLabel = message.modelInfo
      ? `${message.modelInfo.providerID} · ${message.modelInfo.modelID}`
      : undefined

    return {
      ...message,
      visibleParts,
      hasText,
      modelLabel,
    }
  })
})

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
  () => props.messages,
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
          <!-- Thinking indicator (before any text arrives) -->
          <div v-if="message.streaming && !message.hasText" class="thinking">
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

            <!-- Unknown part (debug fallback) -->
            <div v-else-if="vp.vtype === 'unknown'" class="unknown-part">
              <span class="unknown-part-label">{{ t('chat.unknownPart.label') }}: {{ vp.part.type }}</span>
              <span class="unknown-part-desc">{{ t('chat.unknownPart.description') }}</span>
            </div>
          </template>

          <!-- Legacy skill cards (backward compat — no parts available) -->
          <div v-if="message.visibleParts.every(vp => vp.vtype !== 'tool') && message.skills?.length" class="skill-cards">
            <SkillCard
              v-for="skill in message.skills"
              :key="skill.id"
              :id="skill.id"
              :name="skill.name"
              :status="skill.status"
              :summary="skill.summary"
              :input="skill.input"
              :output="skill.output"
              :icon="skill.icon"
            />
          </div>

          <!-- Token stats (for assistant messages) -->
          <TokenStats
            v-if="message.role === 'ai' && !message.streaming && (message.tokens || message.cost)"
            :tokens="message.tokens"
            :cost="message.cost"
          />
        </ChatMessage>
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
  gap: 6px;
  margin: calc(var(--sp) * 1.5) 0;
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
