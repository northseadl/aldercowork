<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Runbook } from './types'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = defineProps<{
  runbook: Runbook
}>()

const emit = defineEmits<{
  'update:name': [name: string]
  'update:content': [content: string]
  'delete': []
  'send': []
}>()

const editingName = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)
const localName = ref(props.runbook.name)
const editorRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.runbook.id, () => {
  localName.value = props.runbook.name
  editingName.value = false
})

watch(() => props.runbook.name, (v) => {
  if (!editingName.value) localName.value = v
})

function startEditName() {
  editingName.value = true
  localName.value = props.runbook.name
  nextTick(() => nameInput.value?.select())
}

function commitName() {
  editingName.value = false
  const trimmed = localName.value.trim()
  if (trimmed && trimmed !== props.runbook.name) {
    emit('update:name', trimmed)
  } else {
    localName.value = props.runbook.name
  }
}

// --- Content editing with debounced persistence ---

let contentDebounce: ReturnType<typeof setTimeout> | null = null

function handleContentInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  if (contentDebounce) clearTimeout(contentDebounce)
  contentDebounce = setTimeout(() => {
    emit('update:content', value)
  }, 400)
}

// --- Todo checkbox toggle ---

function handleEditorClick(e: MouseEvent) {
  // Clicking in a textarea doesn't give us rich node info.
  // Instead, we detect todo toggle by checking the line at cursor position.
  // This is handled by the keyboard shortcut (Cmd+Enter on a todo line).
}

function handleEditorKeydown(e: KeyboardEvent) {
  const textarea = editorRef.value
  if (!textarea) return

  // Cmd/Ctrl + Enter on a todo line → toggle checkbox
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    toggleTodoAtCursor(textarea)
    return
  }

  // Tab → insert 2 spaces
  if (e.key === 'Tab') {
    e.preventDefault()
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = textarea.value
    textarea.value = value.slice(0, start) + '  ' + value.slice(end)
    textarea.selectionStart = textarea.selectionEnd = start + 2
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

function toggleTodoAtCursor(textarea: HTMLTextAreaElement) {
  const value = textarea.value
  const cursor = textarea.selectionStart

  // Find line boundaries
  const lineStart = value.lastIndexOf('\n', cursor - 1) + 1
  const lineEnd = value.indexOf('\n', cursor)
  const lineEndSafe = lineEnd === -1 ? value.length : lineEnd
  const line = value.slice(lineStart, lineEndSafe)

  let newLine: string
  if (line.match(/^(\s*)- \[ \]/)) {
    newLine = line.replace(/^(\s*)- \[ \]/, '$1- [x]')
  } else if (line.match(/^(\s*)- \[x\]/i)) {
    newLine = line.replace(/^(\s*)- \[x\]/i, '$1- [ ]')
  } else {
    return
  }

  const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEndSafe)
  textarea.value = newValue
  textarea.selectionStart = textarea.selectionEnd = cursor
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

// --- Preview rendering ---

/**
 * Render content to HTML for the preview pane.
 * Handles: @skill highlights, todo checkboxes, basic markdown.
 */
function renderPreview(content: string): string {
  if (!content) return `<span class="preview-empty">${t('runbooks.emptyContent')}</span>`

  let html = escapeHtml(content)

  // Todo checkboxes: `- [ ]` → unchecked, `- [x]` → checked
  html = html.replace(
    /^(\s*)- \[ \] (.+)$/gm,
    '$1<label class="todo todo--pending"><span class="todo__box"></span><span class="todo__text">$2</span></label>',
  )
  html = html.replace(
    /^(\s*)- \[x\] (.+)$/gim,
    '$1<label class="todo todo--done"><span class="todo__box todo__box--checked"></span><span class="todo__text">$2</span></label>',
  )

  // @skill references
  html = html.replace(
    /@([\w-]+(?:\/[\w-]+)*)/g,
    '<span class="skill-ref">@$1</span>',
  )

  // Headers: # / ## / ###
  html = html.replace(/^### (.+)$/gm, '<h4 class="preview-h">$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3 class="preview-h">$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2 class="preview-h">$1</h2>')

  // Blank lines → paragraph breaks
  html = html.replace(/\n\n/g, '<br><br>')
  html = html.replace(/\n/g, '<br>')

  return html
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const previewHtml = computed(() => renderPreview(props.runbook.content))

// --- View mode ---

const viewMode = ref<'edit' | 'preview'>('edit')
</script>

<template>
  <section class="rb-editor">
    <!-- Header: name + actions -->
    <header class="rb-editor__header">
      <div class="rb-editor__name-row">
        <input
          v-if="editingName"
          ref="nameInput"
          v-model="localName"
          class="rb-editor__name-input"
          type="text"
          @blur="commitName"
          @keydown.enter="commitName"
          @keydown.escape="editingName = false"
        />
        <h2
          v-else
          class="rb-editor__name"
          :title="t('runbooks.clickToRename')"
          @click="startEditName"
        >
          {{ runbook.name || t('runbooks.untitled') }}
        </h2>
      </div>

      <div class="rb-editor__actions">
        <div class="rb-editor__view-toggle">
          <button
            type="button"
            class="rb-editor__tab"
            :class="{ 'is-active': viewMode === 'edit' }"
            @click="viewMode = 'edit'"
          >
            {{ t('runbooks.edit') }}
          </button>
          <button
            type="button"
            class="rb-editor__tab"
            :class="{ 'is-active': viewMode === 'preview' }"
            @click="viewMode = 'preview'"
          >
            {{ t('runbooks.preview') }}
          </button>
        </div>

        <button
          type="button"
          class="rb-editor__send-btn"
          :title="t('runbooks.sendToChat')"
          @click="emit('send')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          {{ t('runbooks.sendToChat') }}
        </button>

        <button
          type="button"
          class="rb-editor__delete-btn"
          :title="t('runbooks.delete')"
          @click="emit('delete')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Hint bar -->
    <p class="rb-editor__hint">
      {{ t('runbooks.editorHint') }}
    </p>

    <!-- Edit mode: textarea -->
    <textarea
      v-if="viewMode === 'edit'"
      ref="editorRef"
      class="rb-editor__textarea"
      :value="runbook.content"
      :placeholder="t('runbooks.placeholder')"
      spellcheck="false"
      @input="handleContentInput"
      @keydown="handleEditorKeydown"
    />

    <!-- Preview mode: rendered HTML -->
    <!-- eslint-disable-next-line vue/no-v-html — content is escaped via escapeHtml before render -->
    <div
      v-else
      class="rb-editor__preview"
      v-html="previewHtml"
    />
  </section>
</template>

<style scoped>
.rb-editor {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0;
}

.rb-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp);
  padding: calc(var(--sp) * 1.5) 0;
}

.rb-editor__name-row {
  min-width: 0;
  flex: 1;
}

.rb-editor__name {
  margin: 0;
  font: var(--fw-semibold) 1.125rem / var(--lh-tight) var(--font);
  color: var(--text-1);
  cursor: pointer;
  border-radius: var(--r-sm);
  padding: 2px 6px;
  margin: -2px -6px;
  transition: background var(--speed-quick) var(--ease);
}

.rb-editor__name:hover {
  background: var(--surface-hover);
}

.rb-editor__name-input {
  width: 100%;
  font: var(--fw-semibold) 1.125rem / var(--lh-tight) var(--font);
  color: var(--text-1);
  background: var(--content-warm);
  border: 1px solid var(--brand);
  border-radius: var(--r-sm);
  padding: 2px 6px;
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.rb-editor__actions {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1);
  flex-shrink: 0;
}

.rb-editor__view-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
}

.rb-editor__tab {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  cursor: pointer;
  transition:
    background var(--speed-quick) var(--ease),
    color var(--speed-quick) var(--ease);
}

.rb-editor__tab:hover {
  color: var(--text-1);
}

.rb-editor__tab.is-active {
  background: var(--surface-active);
  color: var(--text-1);
}

.rb-editor__send-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 calc(var(--sp) * 1.25);
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand-subtle);
  color: var(--brand);
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--speed-regular) var(--ease),
    color var(--speed-regular) var(--ease);
}

.rb-editor__send-btn:hover {
  background: var(--brand);
  color: var(--text-on-brand, #fff);
}

.rb-editor__delete-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition:
    background var(--speed-quick) var(--ease),
    color var(--speed-quick) var(--ease),
    border-color var(--speed-quick) var(--ease);
}

.rb-editor__delete-btn:hover {
  color: var(--syntax-string);
  border-color: var(--syntax-string);
  background: color-mix(in srgb, var(--syntax-string) 8%, transparent);
}

.rb-editor__hint {
  margin: 0;
  padding: 0 0 calc(var(--sp) * 1);
  color: var(--text-3);
  font: var(--fw-regular) var(--text-micro) / var(--lh-normal) var(--font);
}

.rb-editor__textarea {
  width: 100%;
  min-height: 0;
  flex: 1;
  resize: none;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--content-warm);
  color: var(--text-1);
  font: var(--fw-regular) var(--text-small) / var(--lh-relaxed) var(--font-mono);
  padding: calc(var(--sp) * 2);
  outline: none;
  tab-size: 2;
  transition:
    border-color var(--speed-regular) var(--ease),
    box-shadow var(--speed-regular) var(--ease);
}

.rb-editor__textarea::placeholder {
  color: var(--text-3);
}

.rb-editor__textarea:focus-visible {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.rb-editor__preview {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--content-warm);
  color: var(--text-1);
  font: var(--fw-regular) var(--text-small) / var(--lh-relaxed) var(--font);
  padding: calc(var(--sp) * 2);
}

/* --- Preview semantic styles --- */

.rb-editor__preview :deep(.preview-empty) {
  color: var(--text-3);
  font-style: italic;
}

.rb-editor__preview :deep(.preview-h) {
  margin: 0 0 0.25em;
  font-weight: var(--fw-semibold);
  color: var(--text-1);
  line-height: var(--lh-tight);
}

.rb-editor__preview :deep(h2.preview-h) { font-size: 1.25rem; }
.rb-editor__preview :deep(h3.preview-h) { font-size: 1.1rem; }
.rb-editor__preview :deep(h4.preview-h) { font-size: 1rem; }

.rb-editor__preview :deep(.skill-ref) {
  display: inline;
  background: var(--brand-subtle);
  color: var(--brand);
  border-radius: var(--r-sm);
  padding: 1px 5px;
  font: var(--fw-semibold) var(--text-small) / 1.4 var(--font-mono);
}

.rb-editor__preview :deep(.todo) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 2px 0;
  cursor: default;
}

.rb-editor__preview :deep(.todo__box) {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-3);
  border-radius: 3px;
  flex-shrink: 0;
  margin-top: 2px;
}

.rb-editor__preview :deep(.todo__box--checked) {
  background: var(--brand);
  border-color: var(--brand);
  position: relative;
}

.rb-editor__preview :deep(.todo__box--checked)::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 0;
  width: 5px;
  height: 9px;
  border: solid var(--content);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.rb-editor__preview :deep(.todo--done .todo__text) {
  text-decoration: line-through;
  color: var(--text-3);
}
</style>
