<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

import { ChatThread } from '../components/chat'
import ModelPicker from '../components/chat/ModelPicker.vue'
import ReferencePopover from '../components/chat/ReferencePopover.vue'
import ReferenceStrip from '../components/chat/ReferenceStrip.vue'
import { useChat, useClient, useConfirm, useReference, useToast } from '../composables'
import { useKernel } from '../composables/useKernel'
import { useSessionStore } from '../stores/session'
import { useWorkspaceStore } from '../stores/workspace'
import { useI18n } from '../i18n'

import type { ChatThreadMessage } from '../components/chat'
import type { PermissionDecision, PermissionRequest } from '../composables'
import type { FileAttachment } from '../stores/session'

const { t } = useI18n()
const sessionStore = useSessionStore()
const workspaceStore = useWorkspaceStore()
const toast = useToast()
const { confirmPermission } = useConfirm()

const { port: kernelPort, status: kernelStatus, restart: restartKernel } = useKernel()
// ChatView creates its own SDK client ref for useChat.
// Why not read from sessionStore.client? The SDK's internal methods use `this` binding,
// which breaks when the OpencodeClient passes through Pinia's reactive() proxy.
// App.vue's global client handles sessionStore (session CRUD / ensureActiveSession).
// This local client handles useChat (SSE streaming / promptAsync).
const { client: sdkClient } = useClient(kernelPort, computed(() => workspaceStore.activePath))

const activeSessionId = computed(() => sessionStore.activeSessionId)

// Model variant (thinking depth) — provided by ModelPicker
const modelPickerRef = ref<InstanceType<typeof ModelPicker> | null>(null)
const modelVariant = computed(() => modelPickerRef.value?.currentVariant ?? null)

async function resolvePermissionRequest(request: PermissionRequest): Promise<PermissionDecision> {
  return confirmPermission(request)
}

const {
  messages: chatMessages,
  isStreaming,
  streamError,
  turnArtifacts,
  sessionArtifacts,
  send: rawSend,
  cancelStream,
} = useChat(
  sdkClient,
  activeSessionId,
  modelVariant,
  resolvePermissionRequest,
  // SSE session.updated → update sidebar title in real time
  (sid, title) => sessionStore.updateSessionTitle(sid, title),
)

// ---------------------------------------------------------------------------
// File attachments
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024 // 20MB
const MAX_ATTACHMENT_COUNT = 12
const MAX_IMAGE_ATTACHMENT_COUNT = 6
const MAX_TOTAL_ATTACHMENT_BYTES = 30 * 1024 * 1024 // 30MB
const MESSAGE_WINDOW_PAGE_SIZE = 200

const ACCEPTED_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/markdown', 'application/json',
  'text/csv', 'application/xml', 'text/xml', 'text/yaml',
])

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasImageExtension(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext ?? '')
}

function isImageFile(file: Pick<File, 'type' | 'name'>): boolean {
  if (file.type.startsWith('image/')) return true
  return hasImageExtension(file.name)
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let value = bytes
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = unitIndex === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

function validateAttachmentFile(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${t('chat.attachments.fileTooLarge')} (${formatBytes(MAX_ATTACHMENT_BYTES)})`
  }

  if (file.type && ACCEPTED_MIMES.has(file.type)) return null

  // Fallback: check extension for files with no MIME
  const ext = file.name.split('.').pop()?.toLowerCase()
  const accepted = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml']
  return accepted.includes(ext ?? '') ? null : t('chat.attachments.unsupportedFile')
}

const pendingAttachments = ref<FileAttachment[]>([])
const messageWindowPages = ref(1)
const composeError = ref<string | null>(null)
const streamErrorSessionId = ref('')

const pendingAttachmentBytes = computed(() =>
  pendingAttachments.value.reduce((sum, item) => sum + (item.bytes ?? 0), 0),
)

const pendingImageCount = computed(() =>
  pendingAttachments.value.reduce((count, item) => (item.mime.startsWith('image/') ? count + 1 : count), 0),
)

const attachmentButtonDisabled = computed(() =>
  kernelStatus.value !== 'running' || pendingAttachments.value.length >= MAX_ATTACHMENT_COUNT,
)

function getAttachmentQueueError(file: File): string | null {
  if (pendingAttachments.value.length >= MAX_ATTACHMENT_COUNT) {
    return `${t('chat.attachments.maxFilesReached')} (${MAX_ATTACHMENT_COUNT})`
  }

  if (isImageFile(file) && pendingImageCount.value >= MAX_IMAGE_ATTACHMENT_COUNT) {
    return `${t('chat.attachments.maxImagesReached')} (${MAX_IMAGE_ATTACHMENT_COUNT})`
  }

  if (pendingAttachmentBytes.value + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
    return `${t('chat.attachments.maxTotalSizeReached')} (${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)})`
  }

  return null
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read attachment: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function addAttachmentFromFile(file: File) {
  const validationError = validateAttachmentFile(file)
  if (validationError) {
    toast.error(validationError)
    return
  }

  const queueError = getAttachmentQueueError(file)
  if (queueError) {
    toast.error(queueError)
    return
  }

  try {
    const url = await readFileAsDataURL(file)
    // Re-check after async read to guard concurrent adds.
    const recheckError = getAttachmentQueueError(file)
    if (recheckError) {
      toast.error(recheckError)
      return
    }

    pendingAttachments.value = [
      ...pendingAttachments.value,
      {
        mime: file.type || 'application/octet-stream',
        url,
        filename: file.name,
        bytes: file.size,
      },
    ]
  } catch (error) {
    console.warn('[ChatView] FileReader error for:', file.name, error)
    toast.error(t('chat.attachments.readFailed'))
  }
}

function removeAttachment(index: number) {
  const next = [...pendingAttachments.value]
  const [removed] = next.splice(index, 1)
  if (removed) {
    removed.url = ''
  }
  pendingAttachments.value = next
}

function handleAttachClick() {
  if (attachmentButtonDisabled.value) return

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = 'image/*,.pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml'
  input.onchange = async () => {
    if (input.files) {
      for (const f of Array.from(input.files)) {
        // Keep deterministic order for easier user preview and limit checks.
        await addAttachmentFromFile(f)
      }
    }
  }
  input.click()
}

async function handlePaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files
  if (!files?.length) return

  let hasAcceptedAttachment = false
  for (const f of Array.from(files)) {
    if (!validateAttachmentFile(f)) {
      hasAcceptedAttachment = true
      await addAttachmentFromFile(f)
    }
  }
  if (hasAcceptedAttachment) e.preventDefault()
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files?.length) return
  for (const f of Array.from(files)) {
    await addAttachmentFromFile(f)
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

// ---------------------------------------------------------------------------
// RichMessage → ChatThreadMessage mapping
// ---------------------------------------------------------------------------

const visibleMessageLimit = computed(() => messageWindowPages.value * MESSAGE_WINDOW_PAGE_SIZE)

const windowedMessages = computed(() => {
  const source = chatMessages.value
  const limit = visibleMessageLimit.value
  if (source.length <= limit) return source
  return source.slice(source.length - limit)
})

const hiddenMessageCount = computed(() =>
  Math.max(0, chatMessages.value.length - windowedMessages.value.length),
)

const visibleStreamError = computed(() => {
  if (composeError.value) return composeError.value
  if (!streamError.value) return null
  if (streamErrorSessionId.value && streamErrorSessionId.value !== activeSessionId.value) return null
  return streamError.value
})

function expandMessageWindow() {
  if (hiddenMessageCount.value <= 0) return
  messageWindowPages.value += 1
}

const displayMessages = computed<ChatThreadMessage[]>(() => {
  return windowedMessages.value.map((msg) => {
    const textContent = msg.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('')

    return {
      id: msg.id,
      artifactTurnId: msg.turnId,
      role: msg.role === 'user' ? ('user' as const) : ('ai' as const),
      author: msg.role === 'user' ? t('chat.authorUser') : t('chat.authorAssistant'),
      timestamp: formatTime(msg.createdAt),
      avatar: msg.role === 'user' ? 'Y' : undefined,
      content: textContent,
      streaming: msg.streaming,
      parts: msg.parts,
      tokens: msg.tokens,
      cost: msg.cost,
      modelInfo: msg.modelInfo,
    }
  })
})

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

const inputText = ref('')
const composeRef = ref<HTMLTextAreaElement | null>(null)

// @ Reference system
const {
  isOpen: refPopoverOpen,
  isSearching: refSearching,
  candidates: refCandidates,
  selectedIndex: refSelectedIndex,
  query: refQuery,
  pendingReferences,
  pendingCommand,
  hasReferences,
  hasCommand,
  open: openRefPopover,
  close: closeRefPopover,
  updateQuery: updateRefQuery,
  selectCandidate: selectRefCandidate,
  removeReference,
  clearCommand,
  clearReferences,
  moveSelection: moveRefSelection,
} = useReference(sdkClient)

const canSend = computed(() => (inputText.value.trim().length > 0 || pendingAttachments.value.length > 0 || hasReferences.value || hasCommand.value) && !isStreaming.value)
let modelRestartTimer: ReturnType<typeof setTimeout> | null = null



function handleModelChanged() {
  if (modelRestartTimer) clearTimeout(modelRestartTimer)
  modelRestartTimer = setTimeout(async () => {
    if (kernelStatus.value !== 'running' && kernelStatus.value !== 'starting') return
    cancelStream()
    try {
      await restartKernel()
    } catch (error: unknown) {
      toast.error(toErrorMessage(error))
    }
  }, 250)
}

function clearPendingAttachments() {
  if (!pendingAttachments.value.length) return
  for (const attachment of pendingAttachments.value) {
    attachment.url = ''
  }
  pendingAttachments.value = []
}

function resetComposeState() {
  inputText.value = ''
  clearPendingAttachments()
  clearReferences()
  composeError.value = null

  if (composeRef.value) {
    composeRef.value.style.height = 'auto'
  }
}

watch(streamError, (error) => {
  if (error) {
    streamErrorSessionId.value = activeSessionId.value
    toast.error(error)
  }
})

watch(activeSessionId, (next, prev) => {
  if (!prev || next === prev) return

  cancelStream()
  resetComposeState()
  messageWindowPages.value = 1
})

watch(
  () => chatMessages.value.length,
  (next, prev) => {
    if (next < prev) {
      messageWindowPages.value = 1
    }
  },
)



onBeforeRouteLeave(() => {
  cancelStream()
  resetComposeState()
})

onBeforeUnmount(() => {
  if (modelRestartTimer) clearTimeout(modelRestartTimer)
  cancelStream()
  resetComposeState()
})

// --- Cross-route prompt injection (e.g. runbook → chat) ---
// When RunbooksView deposits a prompt via sessionStore.setPendingPrompt(),
// this watcher consumes and dispatches it through the full SSE streaming pipeline.
// We watch `sdkClient` instead of using onMounted because useClient creates the
// SDK client asynchronously (watches kernelPort), so it's typically null on mount.
watch(
  sdkClient,
  async (client) => {
    if (!client) return
    // consumePendingPrompt is one-shot: returns null after first call
    const injected = sessionStore.consumePendingPrompt()
    if (!injected) return

    const activeId = await sessionStore.ensureActiveSession()
    if (!activeId) return

    try {
      await rawSend(injected)
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
    sessionStore.touchSession(sessionStore.activeSessionId)
  },
  { immediate: true },
)

async function handleSend() {
  const text = inputText.value.trim()
  if ((!text && !pendingAttachments.value.length && !hasReferences.value && !hasCommand.value) || isStreaming.value) return

  const activeId = await sessionStore.ensureActiveSession()
  if (!activeId) {
    composeError.value = sessionStore.error ?? t('chat.streamInterrupted')
    toast.error(composeError.value)
    return
  }

  const attachments = pendingAttachments.value.map((attachment) => ({ ...attachment }))
  const references = pendingReferences.value.map((ref) => ({ ...ref }))
  const commandRef = pendingCommand.value ? { ...pendingCommand.value } : undefined
  inputText.value = ''
  clearPendingAttachments()
  clearReferences()
  composeError.value = null

  if (composeRef.value) composeRef.value.style.height = 'auto'

  try {
    await rawSend({
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      references: references.length > 0 ? references : undefined,
      commandRef,
    })
  } catch (error) {
    composeError.value = toErrorMessage(error)
    toast.error(composeError.value)
    return
  }

  const session = sessionStore.activeSession
  if (session && (session.title === 'New Session' || session.title === 'Untitled') && text.length > 0) {
    void sessionStore.renameSession(session.id, text.length > 40 ? text.slice(0, 40) + '…' : text)
  }
  sessionStore.touchSession(sessionStore.activeSessionId)
  await nextTick()
  composeRef.value?.focus()
}

function handleKeydown(e: KeyboardEvent) {
  // @ reference popover interception
  if (refPopoverOpen.value) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveRefSelection(1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveRefSelection(-1); return }
    if (e.key === 'Enter') { e.preventDefault(); selectRefByIndex(); return }
    if (e.key === 'Escape') { e.preventDefault(); closeRefPopover(); return }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void handleSend()
  }
}

function selectRefByIndex() {
  const candidate = refCandidates.value[refSelectedIndex.value]
  if (candidate) {
    selectRefCandidate(candidate)
    // Remove the '@...' text fragment from textarea
    stripAtFragment()
  }
}

/** Remove the trailing @query fragment from the textarea. */
function stripAtFragment() {
  const textarea = composeRef.value
  if (!textarea) return
  const pos = textarea.selectionStart ?? inputText.value.length
  const before = inputText.value.slice(0, pos)
  const atIdx = before.lastIndexOf('@')
  if (atIdx < 0) return
  inputText.value = inputText.value.slice(0, atIdx) + inputText.value.slice(pos)
}

function autoResize(e: Event) {
  const textarea = e.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
}

/** Detect @ trigger on input and open reference popover */
function handleComposeInput(e: Event) {
  autoResize(e)
  detectAtTrigger()
}

function detectAtTrigger() {
  const textarea = composeRef.value
  if (!textarea) return
  const pos = textarea.selectionStart ?? inputText.value.length
  const before = inputText.value.slice(0, pos)
  const atIdx = before.lastIndexOf('@')
  if (atIdx < 0 || (atIdx > 0 && before[atIdx - 1] !== ' ' && before[atIdx - 1] !== '\n')) {
    if (refPopoverOpen.value) closeRefPopover()
    return
  }
  const fragment = before.slice(atIdx + 1)
  // Don't trigger if there's a space after @
  if (fragment.includes(' ') || fragment.includes('\n')) {
    if (refPopoverOpen.value) closeRefPopover()
    return
  }

  if (!refPopoverOpen.value) {
    openRefPopover(fragment)
  } else {
    updateRefQuery(fragment)
  }
}

function handleRefSelect(candidate: import('../composables/useReference').ReferenceCandidate) {
  selectRefCandidate(candidate)
  stripAtFragment()
  composeRef.value?.focus()
}


function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function attachmentDisplayName(att: FileAttachment): string {
  if (att.filename) return att.filename
  if (att.mime.startsWith('image/')) return t('chat.file.image')
  return t('chat.file.generic')
}
</script>

<template>
  <section class="chat-view">
    <template v-if="displayMessages.length === 0 && !isStreaming">
      <div class="chat-empty">
        <div class="chat-empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="0" y="0" width="19.5" height="19.5" rx="4.5" fill="var(--brand)" opacity=".45" />
            <rect x="4.5" y="4.5" width="19.5" height="19.5" rx="4.5" fill="var(--brand)" opacity=".75" />
          </svg>
        </div>
        <h2 class="chat-empty__title">{{ t('chat.empty.title') }}</h2>
        <p class="chat-empty__desc">{{ t('chat.empty.desc') }}</p>

        <div v-if="kernelStatus === 'starting'" class="chat-empty__status is-starting">
          <span class="chat-empty__dot" />
          <span>{{ t('chat.empty.starting') }}</span>
        </div>
        <div v-else-if="kernelStatus === 'error'" class="chat-empty__status is-error">
          <span class="chat-empty__dot" />
          <span>{{ t('chat.empty.error') }}</span>
        </div>
        <div v-else-if="kernelStatus === 'stopped'" class="chat-empty__status">
          <span class="chat-empty__dot" />
          <span>{{ t('chat.empty.stopped') }}</span>
        </div>
      </div>
    </template>

    <template v-else>
      <div v-if="hiddenMessageCount > 0" class="history-window">
        <button
          type="button"
          class="history-window__btn"
          :aria-label="`${hiddenMessageCount}`"
          :title="`${hiddenMessageCount}`"
          @click="expandMessageWindow"
        >
          ↑ {{ hiddenMessageCount }}
        </button>
      </div>

      <ChatThread
        :messages="displayMessages"
        :turn-artifacts-by-turn-id="turnArtifacts"
        :session-artifact-summary="sessionArtifacts"
      >
        <template #compose><div /></template>
      </ChatThread>
    </template>

    <div v-if="isStreaming" class="streaming-indicator">
      <span class="streaming-dot" />
      <span class="streaming-label">{{ t('chat.streaming') }}</span>
    </div>

    <div v-if="visibleStreamError" class="stream-error">
      <svg class="stream-error__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {{ visibleStreamError }}
    </div>

    <div
      class="compose"
      @drop="handleDrop"
      @dragover="handleDragOver"
    >
      <div class="omnibar">
        <!-- Attachment preview strip -->
        <div v-if="pendingAttachments.length > 0" class="attachment-strip">
          <div
            v-for="(att, idx) in pendingAttachments"
            :key="idx"
            class="attachment-chip"
          >
            <img
              v-if="att.mime.startsWith('image/')"
              :src="att.url"
              class="attachment-thumb"
              :alt="attachmentDisplayName(att)"
            />
            <svg v-else class="attachment-file-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
            <span class="attachment-name">{{ attachmentDisplayName(att) }}</span>
            <button type="button" class="attachment-remove" @click="removeAttachment(idx)" :aria-label="t('chat.file.remove')">×</button>
          </div>
        </div>
        <!-- Reference preview strip -->
        <ReferenceStrip
          v-if="hasReferences || hasCommand"
          :references="pendingReferences"
          :command="pendingCommand"
          @remove-reference="removeReference"
          @clear-command="clearCommand"
        />

        <textarea
          ref="composeRef"
          v-model="inputText"
          class="omnibar-field"
          :placeholder="isStreaming ? t('chat.streaming') : t('chat.placeholder')"
          rows="1"
          :disabled="kernelStatus !== 'running' || isStreaming"
          @keydown="handleKeydown"
          @input="handleComposeInput"
          @paste="handlePaste"
        />

        <div class="omnibar-foot">
          <div class="omnibar-tools">
            <ModelPicker
              ref="modelPickerRef"
              :client="sdkClient"
              @model-changed="handleModelChanged"
            />
            <button
              class="omnibar-tool-btn"
              :title="t('chat.reference.addReference')"
              :disabled="kernelStatus !== 'running'"
              @click="openRefPopover('')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
              </svg>
            </button>
            <button
              class="omnibar-tool-btn"
              :title="t('chat.attachFile')"
              :disabled="attachmentButtonDisabled"
              @click="handleAttachClick"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>

          </div>

          <button
            type="button"
            class="omnibar-send"
            :class="{ 'is-streaming': isStreaming }"
            :aria-label="isStreaming ? t('chat.cancelStream') : t('chat.send')"
            :title="isStreaming ? t('chat.cancelStream') : t('chat.send')"
            :disabled="(!canSend && !isStreaming) || kernelStatus !== 'running'"
            @click="isStreaming ? cancelStream() : handleSend()"
          >
            <svg v-if="isStreaming" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>

        <!-- Reference popover: positioned above the omnibar -->
        <ReferencePopover
          :is-open="refPopoverOpen"
          :is-searching="refSearching"
          :candidates="refCandidates"
          :selected-index="refSelectedIndex"
          :query="refQuery"
          @update:query="updateRefQuery"
          @select="handleRefSelect"
          @close="closeRefPopover"
          @move="moveRefSelection"
        />
      </div>

      <div class="compose-hint">{{ t('chat.hint') }}</div>
    </div>
  </section>
</template>

<style scoped>
.chat-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--sp) * 1.5);
  padding: calc(var(--sp) * 4);
  text-align: center;
}

.chat-empty__icon svg { width: 48px; height: 48px; }

.chat-empty__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-display) / var(--lh-tight) var(--font);
  letter-spacing: var(--ls-display);
  color: var(--text-1);
  text-wrap: balance;
}

.chat-empty__desc {
  margin: 0;
  max-width: 400px;
  color: var(--text-3);
  font-size: var(--text-small);
  line-height: var(--lh-relaxed);
}

.chat-empty__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(var(--sp) * 1) calc(var(--sp) * 2);
  border-radius: var(--r-lg);
  background: var(--surface-card);
  border: 1px solid var(--border);
  color: var(--text-3);
  font-size: var(--text-micro);
}

.chat-empty__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-full);
  background: var(--text-3);
  flex-shrink: 0;
}

.chat-empty__status.is-starting .chat-empty__dot {
  background: var(--color-warning);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.chat-empty__status.is-error .chat-empty__dot {
  background: var(--color-error);
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 calc(var(--sp) * 4);
  max-width: 680px;
  margin: 0 auto;
}

.streaming-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-full);
  background: var(--brand);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.streaming-label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  flex: 1;
}

.stream-error {
  max-width: 680px;
  margin: 0 auto;
  padding: 8px calc(var(--sp) * 4);
  font-size: var(--text-micro);
  color: var(--color-error);
  display: flex;
  align-items: center;
  gap: 6px;
}

.stream-error__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.history-window {
  max-width: 680px;
  width: 100%;
  margin: 0 auto;
  padding: 0 calc(var(--sp) * 4) calc(var(--sp) * 1.5);
  display: flex;
  justify-content: center;
}

.history-window__btn {
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  background: var(--surface-card);
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  padding: 6px 10px;
  cursor: pointer;
}

.history-window__btn:hover {
  color: var(--text-1);
  background: var(--surface-hover);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.compose {
  padding: calc(var(--sp) * 2) calc(var(--sp) * 4) calc(var(--sp) * 3);
}

.omnibar {
  position: relative;
  max-width: 680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--content-warm);
  border: 1px solid var(--border);
  border-radius: var(--r-2xl);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--speed-quick) var(--ease), box-shadow var(--speed-quick) var(--ease);
}

.omnibar:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
  transition: border-color var(--speed-precision) var(--ease), box-shadow var(--speed-precision) var(--ease);
}

/* Attachment preview strip */
.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px 0;
}

.attachment-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 4px;
  border-radius: var(--r-md);
  background: var(--surface-active);
  border: 1px solid var(--border);
  font-size: 11px;
  max-width: 180px;
}

.attachment-thumb {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  object-fit: cover;
}

.attachment-file-icon {
  flex-shrink: 0;
  color: var(--text-3);
}

.attachment-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}

.attachment-remove {
  width: 18px;
  height: 18px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  border-radius: var(--r-sm);
  flex-shrink: 0;
}

.attachment-remove:hover {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
}

.omnibar-field {
  width: 100%;
  background: transparent;
  border: 0;
  padding: 16px 18px 8px;
  font: var(--text-small) var(--font);
  color: var(--text-1);
  outline: 0;
  resize: none;
  min-height: 48px;
  max-height: 250px;
  line-height: var(--lh-normal);
}

.omnibar-field:disabled { opacity: 0.5; cursor: not-allowed; }
.omnibar-field::placeholder { color: var(--text-3); }

.omnibar-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 10px 18px;
}

.omnibar-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.omnibar-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: color var(--speed-quick), background var(--speed-quick);
}

.omnibar-tool-btn:hover {
  color: var(--text-1);
  background: var(--surface-hover);
}

.omnibar-tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: transparent;
  color: var(--text-3);
}

.omnibar-tool-btn svg { width: 15px; height: 15px; }

.omnibar-send {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--r-xl);
  background: var(--brand);
  color: var(--on-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity var(--speed-quick) var(--ease), transform var(--speed-quick) var(--ease);
}

.omnibar-send:hover:not(:disabled) { opacity: .85; }
.omnibar-send:active:not(:disabled) { transform: scale(.96); }
.omnibar-send:disabled { cursor: not-allowed; opacity: 0.45; }
.omnibar-send svg { width: 14px; height: 14px; }

.omnibar-send.is-streaming {
  background: transparent;
  color: var(--text-3);
  border: 1px solid var(--border);
}

.omnibar-send.is-streaming:hover:not(:disabled) {
  opacity: 1;
  color: var(--color-error);
  border-color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
}

.compose-hint {
  text-align: center;
  font-size: var(--text-micro);
  color: var(--text-3);
  padding-top: var(--sp);
  max-width: 680px;
  margin: 0 auto;
}
</style>
