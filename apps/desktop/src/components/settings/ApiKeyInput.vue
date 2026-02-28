<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

import { useI18n } from '../../i18n'
import { useCredentialStore } from '../../composables/useCredentialStore'

const props = defineProps<{
  providerId: string
  envVar: string
  hasKey: boolean
}>()

const emit = defineEmits<{
  saved: [hasKey: boolean]
}>()

const { t } = useI18n()
const creds = useCredentialStore()

const editing = ref(false)
const inputValue = ref('')
const saving = ref(false)
const showFull = ref(false)
const maskedValue = ref('')

const isEmpty = computed(() => !props.hasKey)

onMounted(async () => {
  if (props.hasKey) {
    const key = await creds.getApiKey(props.providerId)
    if (key) {
      maskedValue.value = maskKey(key)
    }
  }
})

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return '••••••••' + key.slice(-4)
}

function startEdit() {
  editing.value = true
  inputValue.value = ''
}

function cancelEdit() {
  editing.value = false
  inputValue.value = ''
}

async function saveKey() {
  const trimmed = inputValue.value.trim()
  if (!trimmed) return

  saving.value = true
  try {
    await creds.setApiKey(props.providerId, trimmed)
    maskedValue.value = maskKey(trimmed)
    editing.value = false
    inputValue.value = ''
    emit('saved', true)
  } finally {
    saving.value = false
  }
}

async function removeKey() {
  saving.value = true
  try {
    await creds.removeApiKey(props.providerId)
    maskedValue.value = ''
    emit('saved', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="aki">
    <!-- Display mode: key exists but not editing -->
    <div v-if="hasKey && !editing" class="aki__display">
      <code class="aki__masked">{{ maskedValue || '••••••••' }}</code>
      <div class="aki__actions">
        <button class="aki__btn aki__btn--edit" @click="startEdit" :title="t('settings.providers.editKey')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button class="aki__btn aki__btn--remove" @click="removeKey" :disabled="saving" :title="t('settings.providers.removeKey')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Edit mode -->
    <div v-else-if="editing" class="aki__edit">
      <input
        v-model="inputValue"
        type="password"
        class="aki__input"
        :placeholder="`${envVar}=sk-...`"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="saveKey"
        @keydown.escape="cancelEdit"
      />
      <div class="aki__edit-actions">
        <button class="aki__btn aki__btn--save" :disabled="!inputValue.trim() || saving" @click="saveKey">
          {{ t('common.save') }}
        </button>
        <button class="aki__btn aki__btn--cancel" @click="cancelEdit">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>

    <!-- Empty state: no key configured -->
    <button v-else class="aki__setup" @click="startEdit">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {{ t('settings.providers.setKey') }}
    </button>
  </div>
</template>

<style scoped>
.aki { width: 100%; }

.aki__display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.aki__masked {
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  color: var(--text-3);
  letter-spacing: .02em;
}

.aki__actions {
  display: flex;
  gap: 4px;
}

.aki__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  cursor: pointer;
  transition: color var(--speed-quick), background var(--speed-quick);
  border-radius: var(--r-sm);
}

.aki__btn svg {
  width: 14px;
  height: 14px;
}

.aki__btn--edit,
.aki__btn--remove {
  width: 28px;
  height: 28px;
  color: var(--text-4);
}

.aki__btn--edit:hover { color: var(--brand); background: var(--surface-hover); }
.aki__btn--remove:hover { color: #ef4444; background: rgba(239, 68, 68, .08); }
.aki__btn--remove:disabled { opacity: .4; cursor: not-allowed; }

.aki__edit {
  display: grid;
  gap: 8px;
}

.aki__input {
  width: 100%;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--content);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: var(--text-small);
  padding: 0 12px;
  outline: none;
  transition: border-color var(--speed-regular), box-shadow var(--speed-regular);
}

.aki__input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.aki__edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.aki__btn--save,
.aki__btn--cancel {
  height: 30px;
  padding: 0 14px;
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
}

.aki__btn--save {
  background: var(--brand);
  color: var(--shell);
  border-radius: var(--r-md);
}

.aki__btn--save:hover:not(:disabled) { filter: brightness(1.1); }
.aki__btn--save:disabled { opacity: .4; cursor: not-allowed; }

.aki__btn--cancel {
  color: var(--text-3);
}

.aki__btn--cancel:hover { color: var(--text-1); }

.aki__setup {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer;
  transition: border-color var(--speed-quick), color var(--speed-quick), background var(--speed-quick);
}

.aki__setup:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 4%, transparent);
}

.aki__setup svg {
  width: 14px;
  height: 14px;
}
</style>
