<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import StreamingMarkdown from '../chat/StreamingMarkdown.vue'
import SkillAutocompletePopover from '../skills/SkillAutocompletePopover.vue'
import { useI18n } from '../../i18n'
import { useSkillAutocomplete } from '../../composables/useSkillAutocomplete'

import type { Workflow } from './types'

const props = defineProps<{
  workflow: Workflow
}>()

const emit = defineEmits<{
  'update:name': [name: string]
  'update:description': [description: string]
  'update:content': [content: string]
  'execute': []
  'delete': []
}>()

const { t } = useI18n()

// --- Mode toggle ---
type EditorMode = 'edit' | 'preview'
const mode = ref<EditorMode>('edit')

// --- Name editing ---
const nameEditing = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)
const localName = ref(props.workflow.name)

watch(() => props.workflow.name, (v) => { localName.value = v })

function startNameEdit() {
  nameEditing.value = true
  nextTick(() => nameInputRef.value?.focus())
}

function commitName() {
  nameEditing.value = false
  const trimmed = localName.value.trim()
  if (trimmed !== props.workflow.name) {
    emit('update:name', trimmed || t('workflow.untitled'))
  }
}

// --- Description ---
const localDesc = ref(props.workflow.description)
watch(() => props.workflow.description, (v) => { localDesc.value = v })

function handleDescInput() {
  emit('update:description', localDesc.value)
}

// --- Content (Markdown) ---
const contentRef = ref<HTMLTextAreaElement | null>(null)
const localContent = ref(props.workflow.content)
watch(() => props.workflow.content, (v) => { localContent.value = v })

function handleContentInput() {
  emit('update:content', localContent.value)
}

// Sync on workflow switch
watch(() => props.workflow.id, () => {
  localName.value = props.workflow.name
  localDesc.value = props.workflow.description
  localContent.value = props.workflow.content
  mode.value = 'edit'
})

// --- @ Skill autocomplete (shared composable) ---
const skillAc = useSkillAutocomplete({
  textareaRef: contentRef,
  localValue: localContent,
  onUpdate: (v) => emit('update:content', v),
})

const canExecute = computed(() =>
  Boolean(props.workflow.content.trim()),
)
</script>

<template>
  <div class="wf-editor">
    <!-- Header: name + actions -->
    <header class="wf-editor__header">
      <div class="wf-editor__name-area">
        <input
          v-if="nameEditing"
          ref="nameInputRef"
          v-model="localName"
          class="wf-editor__name-input"
          :placeholder="t('workflow.namePlaceholder')"
          @blur="commitName"
          @keydown.enter="commitName"
        />
        <h2 v-else class="wf-editor__name" @click="startNameEdit">
          {{ workflow.name || t('workflow.untitled') }}
          <span class="wf-editor__name-edit-hint">✎</span>
        </h2>
      </div>

      <div class="wf-editor__actions">
        <button
          type="button"
          class="wf-editor__btn wf-editor__btn--primary"
          :disabled="!canExecute"
          @click="emit('execute')"
        >
          {{ t('workflow.execute') }}
        </button>
        <button
          type="button"
          class="wf-editor__btn wf-editor__btn--danger"
          @click="emit('delete')"
        >
          {{ t('workflow.delete') }}
        </button>
      </div>
    </header>

    <!-- Description -->
    <section class="wf-editor__section">
      <label class="wf-editor__label">{{ t('workflow.descriptionLabel') }}</label>
      <input
        v-model="localDesc"
        type="text"
        class="wf-editor__desc-input"
        :placeholder="t('workflow.descriptionPlaceholder')"
        @input="handleDescInput"
      />
    </section>

    <!-- Mode toggle -->
    <div class="wf-editor__mode-toggle">
      <button
        type="button"
        class="wf-editor__mode-btn"
        :class="{ 'is-active': mode === 'edit' }"
        @click="mode = 'edit'"
      >
        {{ t('workflow.modeEdit') }}
      </button>
      <button
        type="button"
        class="wf-editor__mode-btn"
        :class="{ 'is-active': mode === 'preview' }"
        @click="mode = 'preview'"
      >
        {{ t('workflow.modePreview') }}
      </button>
    </div>

    <!-- Content area -->
    <section class="wf-editor__content-area">
      <!-- Edit mode -->
      <div v-if="mode === 'edit'" class="wf-editor__edit-wrap">
        <textarea
          ref="contentRef"
          v-model="localContent"
          class="wf-editor__content"
          :placeholder="t('workflow.contentPlaceholder')"
          @input="handleContentInput"
          @keydown="skillAc.handleKeydown"
          @keyup="skillAc.handleKeyup"
        />

        <SkillAutocompletePopover
          v-if="skillAc.show.value && skillAc.filteredSkills.value.length > 0"
          :skills="skillAc.filteredSkills.value"
          :selected-index="skillAc.selectedIndex.value"
          :position="skillAc.pos.value"
          @select="skillAc.insertSkillRef"
        />
      </div>

      <!-- Preview mode -->
      <div v-else class="wf-editor__preview">
        <StreamingMarkdown
          :text="localContent || t('workflow.previewEmpty')"
          :streaming="false"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.wf-editor {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp) * 2);
  padding: calc(var(--sp) * 3);
  height: 100%;
  overflow-y: auto;
}

/* Header */
.wf-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--sp) * 2);
}

.wf-editor__name-area {
  flex: 1;
  min-width: 0;
}

.wf-editor__name {
  margin: 0;
  font: var(--fw-semibold) var(--text-heading) / var(--lh-tight) var(--font);
  color: var(--text-1);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wf-editor__name-edit-hint {
  opacity: 0;
  font-size: 0.75em;
  color: var(--text-3);
  transition: opacity 0.15s;
}

.wf-editor__name:hover .wf-editor__name-edit-hint {
  opacity: 1;
}

.wf-editor__name-input {
  width: 100%;
  font: var(--fw-semibold) var(--text-heading) / var(--lh-tight) var(--font);
  color: var(--text-1);
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--brand);
  outline: none;
  padding: 2px 0;
}

.wf-editor__actions {
  display: flex;
  gap: calc(var(--sp) * 0.75);
  flex-shrink: 0;
}

/* Buttons */
.wf-editor__btn {
  border: 1px solid var(--border);
  background: var(--surface-card);
  color: var(--text-2);
  border-radius: var(--r-md);
  padding: 6px 14px;
  font: var(--fw-medium) var(--text-sm) / 1.2 var(--font);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.wf-editor__btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.wf-editor__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wf-editor__btn--primary {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--on-brand);
}

.wf-editor__btn--primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.wf-editor__btn--danger {
  color: var(--danger, #e55);
}

.wf-editor__btn--danger:hover:not(:disabled) {
  background: color-mix(in oklab, var(--danger, #e55) 10%, transparent);
}

/* Sections */
.wf-editor__section {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp) * 0.75);
}

.wf-editor__label {
  font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font);
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Description input */
.wf-editor__desc-input {
  width: 100%;
  padding: calc(var(--sp) * 1) calc(var(--sp) * 1.5);
  font: var(--fw-normal) var(--text-base) / 1.4 var(--font);
  color: var(--text-1);
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  outline: none;
  transition: border-color 0.15s;
}

.wf-editor__desc-input:focus {
  border-color: var(--brand);
}

.wf-editor__desc-input::placeholder {
  color: var(--text-3);
}

/* Mode toggle */
.wf-editor__mode-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  width: fit-content;
  overflow: hidden;
}

.wf-editor__mode-btn {
  border: none;
  background: transparent;
  color: var(--text-3);
  padding: 5px 16px;
  font: var(--fw-medium) var(--text-sm) / 1.2 var(--font);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.wf-editor__mode-btn:hover:not(.is-active) {
  background: var(--surface-hover);
  color: var(--text-2);
}

.wf-editor__mode-btn.is-active {
  background: var(--brand);
  color: var(--on-brand);
}

/* Content area */
.wf-editor__content-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wf-editor__edit-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
}

.wf-editor__content {
  width: 100%;
  height: 100%;
  min-height: 200px;
  padding: calc(var(--sp) * 1.5);
  font: var(--fw-normal) var(--text-base) / var(--lh-relaxed) var(--font-mono);
  color: var(--text-1);
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  resize: none;
  outline: none;
  transition: border-color 0.15s;
}

.wf-editor__content:focus {
  border-color: var(--brand);
}

.wf-editor__content::placeholder {
  color: var(--text-3);
}

/* Preview */
.wf-editor__preview {
  flex: 1;
  min-height: 200px;
  padding: calc(var(--sp) * 2);
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow-y: auto;
}
</style>
