<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { useI18n } from '../../i18n'

import type { Runbook, RunbookStep } from './types'

const props = defineProps<{
  runbook: Runbook
}>()

const emit = defineEmits<{
  'update:name': [name: string]
  'update:body': [body: string]
  'add-step': [text: string]
  'update-step': [stepId: string, patch: Partial<Pick<RunbookStep, 'text' | 'checked'>>]
  'remove-step': [stepId: string]
  'move-step': [stepId: string, direction: -1 | 1]
  'execute': []
  'delete': []
}>()

const { t } = useI18n()

// --- Name editing ---
const nameEditing = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)
const localName = ref(props.runbook.name)

watch(() => props.runbook.name, (v) => { localName.value = v })

function startNameEdit() {
  nameEditing.value = true
  nextTick(() => nameInputRef.value?.focus())
}

function commitName() {
  nameEditing.value = false
  const trimmed = localName.value.trim()
  if (trimmed !== props.runbook.name) {
    emit('update:name', trimmed || t('runbooks.untitled'))
  }
}

// --- Body editing ---
const bodyRef = ref<HTMLTextAreaElement | null>(null)
const localBody = ref(props.runbook.body)

watch(() => props.runbook.body, (v) => { localBody.value = v })

function handleBodyInput() {
  emit('update:body', localBody.value)
  autoResizeBody()
}

function autoResizeBody() {
  const el = bodyRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.max(el.scrollHeight, 120)}px`
}

watch(() => props.runbook.id, () => {
  localName.value = props.runbook.name
  localBody.value = props.runbook.body
  nextTick(autoResizeBody)
})

// --- Step editing ---
const newStepInputRef = ref<HTMLInputElement | null>(null)
const newStepText = ref('')

function handleAddStep() {
  const text = newStepText.value.trim()
  if (!text) return
  emit('add-step', text)
  newStepText.value = ''
  nextTick(() => newStepInputRef.value?.focus())
}

function handleStepKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    handleAddStep()
  }
}

// Stats
function stepStats() {
  const total = props.runbook.steps.length
  const done = props.runbook.steps.filter((s) => s.checked).length
  return { total, done }
}
</script>

<template>
  <div class="rb-editor">
    <!-- Header: name + actions -->
    <header class="rb-editor__header">
      <div class="rb-editor__name-area">
        <input
          v-if="nameEditing"
          ref="nameInputRef"
          v-model="localName"
          class="rb-editor__name-input"
          :placeholder="t('runbooks.namePlaceholder')"
          @blur="commitName"
          @keydown.enter="commitName"
        />
        <h2 v-else class="rb-editor__name" @click="startNameEdit">
          {{ runbook.name || t('runbooks.untitled') }}
          <span class="rb-editor__name-edit-hint">✎</span>
        </h2>
      </div>

      <div class="rb-editor__actions">
        <button
          type="button"
          class="rb-editor__btn rb-editor__btn--primary"
          :disabled="!runbook.body.trim() && !runbook.steps.length"
          @click="emit('execute')"
        >
          {{ t('runbooks.sendToChat') }}
        </button>
        <button
          type="button"
          class="rb-editor__btn rb-editor__btn--danger"
          @click="emit('delete')"
        >
          {{ t('runbooks.delete') }}
        </button>
      </div>
    </header>

    <!-- Step stats -->
    <div v-if="runbook.steps.length > 0" class="rb-editor__stats">
      {{ stepStats().done }}/{{ stepStats().total }} {{ t('runbooks.completed') }}
    </div>

    <!-- Body textarea -->
    <section class="rb-editor__section">
      <label class="rb-editor__label">{{ t('runbooks.bodyLabel') }}</label>
      <textarea
        ref="bodyRef"
        v-model="localBody"
        class="rb-editor__body"
        :placeholder="t('runbooks.bodyPlaceholder')"
        @input="handleBodyInput"
      />
    </section>

    <!-- Step list -->
    <section class="rb-editor__section">
      <label class="rb-editor__label">{{ t('runbooks.stepsLabel') }}</label>

      <div v-if="runbook.steps.length > 0" class="rb-editor__steps">
        <div
          v-for="(step, index) in runbook.steps"
          :key="step.id"
          class="rb-step"
        >
          <span class="rb-step__index">{{ index + 1 }}</span>
          <input
            type="checkbox"
            class="rb-step__check"
            :checked="step.checked"
            @change="emit('update-step', step.id, { checked: !step.checked })"
          />
          <input
            type="text"
            class="rb-step__text"
            :value="step.text"
            :placeholder="t('runbooks.stepPlaceholder')"
            @input="emit('update-step', step.id, { text: ($event.target as HTMLInputElement).value })"
            @keydown.enter.prevent
          />
          <div class="rb-step__controls">
            <button
              type="button"
              class="rb-step__btn"
              :disabled="index === 0"
              :title="t('runbooks.moveUp')"
              @click="emit('move-step', step.id, -1)"
            >↑</button>
            <button
              type="button"
              class="rb-step__btn"
              :disabled="index === runbook.steps.length - 1"
              :title="t('runbooks.moveDown')"
              @click="emit('move-step', step.id, 1)"
            >↓</button>
            <button
              type="button"
              class="rb-step__btn rb-step__btn--delete"
              :title="t('runbooks.removeStep')"
              @click="emit('remove-step', step.id)"
            >×</button>
          </div>
        </div>
      </div>

      <!-- Add step input -->
      <div class="rb-editor__add-step">
        <input
          ref="newStepInputRef"
          v-model="newStepText"
          type="text"
          class="rb-editor__add-step-input"
          :placeholder="t('runbooks.addStepPlaceholder')"
          @keydown="handleStepKeydown"
        />
        <button
          type="button"
          class="rb-editor__btn rb-editor__btn--subtle"
          @click="handleAddStep"
        >
          + {{ t('runbooks.addStep') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.rb-editor {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp) * 2);
  padding: calc(var(--sp) * 3);
  height: 100%;
  overflow-y: auto;
}

/* Header */
.rb-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--sp) * 2);
}

.rb-editor__name-area {
  flex: 1;
  min-width: 0;
}

.rb-editor__name {
  margin: 0;
  font: var(--fw-semibold) var(--text-heading) / var(--lh-tight) var(--font);
  color: var(--text-1);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.rb-editor__name-edit-hint {
  opacity: 0;
  font-size: 0.75em;
  color: var(--text-3);
  transition: opacity 0.15s;
}

.rb-editor__name:hover .rb-editor__name-edit-hint {
  opacity: 1;
}

.rb-editor__name-input {
  width: 100%;
  font: var(--fw-semibold) var(--text-heading) / var(--lh-tight) var(--font);
  color: var(--text-1);
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--brand);
  outline: none;
  padding: 2px 0;
}

.rb-editor__actions {
  display: flex;
  gap: calc(var(--sp) * 0.75);
  flex-shrink: 0;
}

/* Buttons */
.rb-editor__btn {
  border: 1px solid var(--border);
  background: var(--surface-card);
  color: var(--text-2);
  border-radius: var(--r-md);
  padding: 6px 14px;
  font: var(--fw-medium) var(--text-sm) / 1.2 var(--font);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.rb-editor__btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.rb-editor__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.rb-editor__btn--primary {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--on-brand);
}

.rb-editor__btn--primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.rb-editor__btn--danger {
  color: var(--danger, #e55);
}

.rb-editor__btn--danger:hover:not(:disabled) {
  background: color-mix(in oklab, var(--danger, #e55) 10%, transparent);
}

.rb-editor__btn--subtle {
  border-color: transparent;
  background: transparent;
  color: var(--brand);
}

.rb-editor__btn--subtle:hover:not(:disabled) {
  background: color-mix(in oklab, var(--brand) 8%, transparent);
}

/* Stats */
.rb-editor__stats {
  font: var(--fw-medium) var(--text-sm) / 1.3 var(--font);
  color: var(--text-3);
}

/* Sections */
.rb-editor__section {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp) * 0.75);
}

.rb-editor__label {
  font: var(--fw-semibold) var(--text-sm) / 1.2 var(--font);
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Body textarea */
.rb-editor__body {
  width: 100%;
  min-height: 120px;
  padding: calc(var(--sp) * 1.5);
  font: var(--fw-normal) var(--text-base) / var(--lh-relaxed) var(--font);
  color: var(--text-1);
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  resize: none;
  outline: none;
  transition: border-color 0.15s;
}

.rb-editor__body:focus {
  border-color: var(--brand);
}

.rb-editor__body::placeholder {
  color: var(--text-3);
}

/* Step list */
.rb-editor__steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rb-step {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 0.75);
  padding: calc(var(--sp) * 0.75) calc(var(--sp) * 1);
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: border-color 0.15s;
}

.rb-step:focus-within {
  border-color: var(--brand);
}

.rb-step__index {
  font: var(--fw-semibold) var(--text-sm) / 1 var(--font-mono);
  color: var(--text-3);
  width: 1.5em;
  text-align: center;
  flex-shrink: 0;
}

.rb-step__check {
  flex-shrink: 0;
  accent-color: var(--brand);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.rb-step__text {
  flex: 1;
  min-width: 0;
  font: var(--fw-normal) var(--text-base) / 1.4 var(--font);
  color: var(--text-1);
  background: transparent;
  border: none;
  outline: none;
  padding: 2px 0;
}

.rb-step__text::placeholder {
  color: var(--text-3);
}

.rb-step__controls {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.rb-step:hover .rb-step__controls {
  opacity: 1;
}

.rb-step__btn {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--text-3);
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.rb-step__btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-1);
}

.rb-step__btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.rb-step__btn--delete:hover:not(:disabled) {
  color: var(--danger, #e55);
  background: color-mix(in oklab, var(--danger, #e55) 10%, transparent);
}

/* Add step */
.rb-editor__add-step {
  display: flex;
  gap: calc(var(--sp) * 0.75);
  align-items: center;
}

.rb-editor__add-step-input {
  flex: 1;
  font: var(--fw-normal) var(--text-base) / 1.4 var(--font);
  color: var(--text-1);
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
  padding: calc(var(--sp) * 0.75) calc(var(--sp) * 1);
  outline: none;
  transition: border-color 0.15s;
}

.rb-editor__add-step-input:focus {
  border-color: var(--brand);
  border-style: solid;
}

.rb-editor__add-step-input::placeholder {
  color: var(--text-3);
}
</style>
