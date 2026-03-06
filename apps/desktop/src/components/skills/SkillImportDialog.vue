<script setup lang="ts">
import { computed, ref } from 'vue'

import { useDialogA11y } from '../../composables/useDialogA11y'
import { AppButton } from '../ui'

const props = defineProps<{
  visible: boolean
  busy: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  importArchive: []
  importGit: [url: string]
}>()

const dialogRef = ref<HTMLElement | null>(null)
const gitUrl = ref('')
const activeTab = ref<'archive' | 'git'>('archive')

const canSubmitGit = computed(() => gitUrl.value.trim().startsWith('https://') || gitUrl.value.trim().startsWith('git@'))

useDialogA11y({
  open: computed(() => props.visible),
  containerRef: dialogRef,
  onEscape: () => emit('cancel'),
})

function submitGit() {
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
          <h2 id="import-dialog-title" class="import-dialog__title">Stage Manual Import</h2>
          <p class="import-dialog__subtitle">Archive and Git imports now enter the same audit-first install flow.</p>
        </header>

        <nav class="import-dialog__tabs" role="tablist">
          <button type="button" class="import-dialog__tab" :class="{ 'is-active': activeTab === 'archive' }" @click="activeTab = 'archive'">
            Archive
          </button>
          <button type="button" class="import-dialog__tab" :class="{ 'is-active': activeTab === 'git' }" @click="activeTab = 'git'">
            Git
          </button>
        </nav>

        <div class="import-dialog__body">
          <div v-if="activeTab === 'archive'" class="import-dialog__panel">
            <p class="import-dialog__hint">Choose a `.zip`, `.tar.gz`, `.tgz`, or `.tar` package. The skill will be staged and audited before install.</p>
            <AppButton variant="brand" :disabled="busy" @click="emit('importArchive')">
              {{ busy ? 'Staging…' : 'Select Archive' }}
            </AppButton>
          </div>

          <div v-else class="import-dialog__panel">
            <label class="import-dialog__field">
              <span class="import-dialog__label">Git URL</span>
              <input
                v-model="gitUrl"
                type="url"
                class="import-dialog__input"
                placeholder="https://github.com/user/repo or .../tree/main/skill"
                :disabled="busy"
                @keydown.enter="submitGit"
              />
            </label>
            <AppButton variant="brand" :disabled="busy || !canSubmitGit" @click="submitGit">
              {{ busy ? 'Staging…' : 'Stage Git Import' }}
            </AppButton>
          </div>

          <p v-if="error" class="import-dialog__error" role="alert">{{ error }}</p>
        </div>

        <footer class="import-dialog__actions">
          <AppButton variant="ghost" @click="emit('cancel')">Close</AppButton>
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
  gap: calc(var(--sp) * 1.5);
}

.import-dialog__header,
.import-dialog__body,
.import-dialog__panel,
.import-dialog__field {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.import-dialog__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font-mono);
}

.import-dialog__subtitle,
.import-dialog__hint {
  margin: 0;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.import-dialog__tabs {
  display: flex;
  gap: calc(var(--sp) * 0.5);
}

.import-dialog__tab {
  min-height: 34px;
  border-radius: var(--r-md);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-3);
  padding: 0 calc(var(--sp) * 1.25);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
}

.import-dialog__tab.is-active {
  border-color: var(--brand);
  background: var(--brand-subtle);
  color: var(--brand);
}

.import-dialog__label {
  color: var(--text-3);
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase;
}

.import-dialog__input {
  min-height: 38px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--content);
  color: var(--text-1);
  padding: 0 calc(var(--sp) * 1.25);
}

.import-dialog__error {
  margin: 0;
  border-radius: var(--r-md);
  padding: calc(var(--sp) * 1);
  background: rgba(239, 68, 68, .12);
  color: #b91c1c;
  font-size: var(--text-small);
}

.import-dialog__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
