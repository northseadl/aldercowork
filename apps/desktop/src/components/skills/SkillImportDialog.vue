<script setup lang="ts">
import { ref, computed } from 'vue'

import { useDialogA11y } from '../../composables/useDialogA11y'
import { useI18n } from '../../i18n'
import { AppButton } from '../ui'

const props = defineProps<{
  visible: boolean
  importing: boolean
  importError: string | null
}>()

const emit = defineEmits<{
  cancel: []
  importArchive: []
  importGit: [url: string]
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)
const gitUrl = ref('')
const activeTab = ref<'archive' | 'git'>('archive')

const isOpen = computed(() => props.visible)
const canSubmitGit = computed(() => {
  const url = gitUrl.value.trim()
  return url.startsWith('https://') || url.startsWith('git@')
})

useDialogA11y({
  open: isOpen,
  containerRef: dialogRef,
  onEscape: () => emit('cancel'),
})

function handleGitSubmit() {
  if (!canSubmitGit.value) return
  emit('importGit', gitUrl.value.trim())
}
</script>

<template>
  <Transition name="import-dialog">
    <div v-if="visible" class="import-overlay" role="presentation" @click.self="emit('cancel')">
      <section
        ref="dialogRef"
        class="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        tabindex="-1"
      >
        <header class="import-dialog__header">
          <h2 id="import-dialog-title" class="import-dialog__title">{{ t('skills.import.title') }}</h2>
          <p class="import-dialog__subtitle">{{ t('skills.import.subtitle') }}</p>
        </header>

        <nav class="import-dialog__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="import-dialog__tab"
            :class="{ 'is-active': activeTab === 'archive' }"
            :aria-selected="activeTab === 'archive'"
            @click="activeTab = 'archive'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="import-dialog__tab-icon">
              <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
            </svg>
            {{ t('skills.import.tabArchive') }}
          </button>
          <button
            type="button"
            role="tab"
            class="import-dialog__tab"
            :class="{ 'is-active': activeTab === 'git' }"
            :aria-selected="activeTab === 'git'"
            @click="activeTab = 'git'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="import-dialog__tab-icon">
              <circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
            </svg>
            {{ t('skills.import.tabGit') }}
          </button>
        </nav>

        <div class="import-dialog__body">
          <!-- Archive import -->
          <div v-if="activeTab === 'archive'" class="import-dialog__panel">
            <p class="import-dialog__hint">{{ t('skills.import.archiveHint') }}</p>
            <AppButton
              variant="brand"
              :disabled="importing"
              @click="emit('importArchive')"
            >
              {{ importing ? t('skills.import.importing') : t('skills.import.selectFile') }}
            </AppButton>
          </div>

          <!-- Git import -->
          <div v-if="activeTab === 'git'" class="import-dialog__panel">
            <p class="import-dialog__hint">{{ t('skills.import.gitHint') }}</p>
            <label class="import-dialog__field">
              <span class="import-dialog__label">{{ t('skills.import.gitUrlLabel') }}</span>
              <input
                v-model="gitUrl"
                type="url"
                class="import-dialog__input"
                :placeholder="t('skills.import.gitUrlPlaceholder')"
                :disabled="importing"
                @keydown.enter="handleGitSubmit"
              />
            </label>
            <AppButton
              variant="brand"
              :disabled="!canSubmitGit || importing"
              @click="handleGitSubmit"
            >
              {{ importing ? t('skills.import.cloning') : t('skills.import.clone') }}
            </AppButton>
          </div>

          <!-- Error display -->
          <p v-if="importError" class="import-dialog__error" role="alert">{{ importError }}</p>
        </div>

        <footer class="import-dialog__actions">
          <AppButton variant="ghost" @click="emit('cancel')">{{ t('common.close') }}</AppButton>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.import-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: calc(var(--sp) * 2);
  background: color-mix(in srgb, var(--shell) 75%, transparent);
  backdrop-filter: blur(4px);
}

.import-dialog {
  width: min(100%, 480px);
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  background: var(--content-warm);
  box-shadow: var(--shadow-card);
  padding: calc(var(--sp) * 2.5);
  display: grid;
  gap: calc(var(--sp) * 2);
}

.import-dialog__header {
  display: grid;
  gap: calc(var(--sp) * 0.5);
}

.import-dialog__title {
  margin: 0;
  color: var(--text-1);
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font-mono);
}

.import-dialog__subtitle {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.import-dialog__tabs {
  display: flex;
  gap: calc(var(--sp) * 0.5);
  border-bottom: 1px solid var(--border);
  padding-bottom: calc(var(--sp) * 0.5);
}

.import-dialog__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  transition:
    color var(--speed-regular) var(--ease),
    background var(--speed-regular) var(--ease),
    border-color var(--speed-regular) var(--ease);
}

.import-dialog__tab:hover {
  color: var(--text-2);
  background: var(--surface-hover);
}

.import-dialog__tab.is-active {
  color: var(--brand);
  background: var(--brand-subtle);
  border-color: var(--brand);
}

.import-dialog__tab-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.import-dialog__body {
  display: grid;
  gap: calc(var(--sp) * 1.5);
}

.import-dialog__panel {
  display: grid;
  gap: calc(var(--sp) * 1.25);
}

.import-dialog__hint {
  margin: 0;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.import-dialog__field {
  display: grid;
  gap: calc(var(--sp) * 0.5);
}

.import-dialog__label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.import-dialog__input {
  height: 38px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--content);
  color: var(--text-1);
  font-size: var(--text-small);
  font-family: var(--font-mono);
  padding: 0 calc(var(--sp) * 1.25);
  outline: none;
  transition:
    border-color var(--speed-regular) var(--ease),
    box-shadow var(--speed-regular) var(--ease);
}

.import-dialog__input::placeholder {
  color: var(--text-3);
}

.import-dialog__input:focus-visible {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.import-dialog__error {
  margin: 0;
  padding: calc(var(--sp) * 1) calc(var(--sp) * 1.25);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--syntax-string) 12%, transparent);
  color: color-mix(in srgb, var(--syntax-string) 70%, var(--text-1));
  font-size: var(--text-small);
  line-height: var(--lh-normal);
  word-break: break-word;
}

.import-dialog__actions {
  display: flex;
  justify-content: flex-end;
}

.import-dialog-enter-active,
.import-dialog-leave-active {
  transition: opacity var(--speed-regular) var(--ease);
}

.import-dialog-enter-active .import-dialog,
.import-dialog-leave-active .import-dialog {
  transition: transform var(--speed-regular) var(--ease), opacity var(--speed-regular) var(--ease);
}

.import-dialog-enter-from,
.import-dialog-leave-to {
  opacity: 0;
}

.import-dialog-enter-from .import-dialog,
.import-dialog-leave-to .import-dialog {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}
</style>
