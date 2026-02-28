<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useI18n } from '../../i18n'
import { getGlobalModel, setGlobalModel } from '../../services/kernelConfig'

const props = defineProps<{
  /** OpenCode SDK client instance (or null if kernel not ready) */
  client: unknown
}>()

const emit = defineEmits<{
  /** Fired after model changes so parent can react (e.g. update variant state) */
  'model-changed': [model: { providerID: string; modelID: string }]
}>()

const { t } = useI18n()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelVariant {
  id: string
  disabled?: boolean
}

interface ProviderModel {
  id: string
  name: string
  variants: Record<string, ModelVariant>
}

interface ConnectedProvider {
  id: string
  name: string
  defaultModelId: string
  models: ProviderModel[]
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const isOpen = ref(false)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const connectedProviders = ref<ConnectedProvider[]>([])
const pickerRef = ref<HTMLElement | null>(null)

/** Current global model from config.json (Source of Truth) */
const currentModel = ref<{ providerID: string; modelID: string } | null>(null)

/** Currently selected variant (thinking depth) */
const currentVariant = ref<string | null>(null)

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const displayLabel = computed(() => {
  if (!currentModel.value) return t('chat.modelPicker.selectModel')
  return `${currentModel.value.providerID} · ${currentModel.value.modelID}`
})

/** Available variants for the currently selected model */
const availableVariants = computed<string[]>(() => {
  if (!currentModel.value) return []
  const provider = connectedProviders.value.find((p) => p.id === currentModel.value!.providerID)
  if (!provider) return []
  const model = provider.models.find((m) => m.id === currentModel.value!.modelID)
  if (!model || !model.variants) return []
  return Object.entries(model.variants)
    .filter(([, v]) => !v.disabled)
    .map(([id]) => id)
})

const hasVariants = computed(() => availableVariants.value.length > 0)

// ---------------------------------------------------------------------------
// Config I/O
// ---------------------------------------------------------------------------

async function loadCurrentModel() {
  currentModel.value = await getGlobalModel()
}

async function selectModel(providerID: string, modelID: string) {
  await setGlobalModel(providerID, modelID)
  currentModel.value = { providerID, modelID }
  // Reset variant when switching model (new model may have different variants)
  currentVariant.value = null
  isOpen.value = false
  emit('model-changed', { providerID, modelID })
}

function selectVariant(variant: string) {
  currentVariant.value = currentVariant.value === variant ? null : variant
}

// ---------------------------------------------------------------------------
// Provider data fetch
// ---------------------------------------------------------------------------

async function fetchProviders() {
  const client = props.client as Record<string, unknown> | null
  if (!client || !('provider' in client)) return

  isLoading.value = true
  loadError.value = null

  try {
    const providerApi = (client as { provider: { list: () => Promise<{ data?: unknown }> } }).provider
    const result = await providerApi.list()
    const data = (result.data ?? {}) as Record<string, unknown>

    const connected = Array.isArray(data.connected)
      ? data.connected.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []

    const defaults = (typeof data.default === 'object' && data.default !== null)
      ? data.default as Record<string, string>
      : {}

    const all = Array.isArray(data.all) ? data.all as Array<Record<string, unknown>> : []

    const providerMap = new Map<string, Record<string, unknown>>()
    for (const p of all) {
      const pid = typeof p.id === 'string' ? p.id : ''
      if (pid) providerMap.set(pid, p)
    }

    connectedProviders.value = connected
      .filter((id) => typeof defaults[id] === 'string' && defaults[id].trim().length > 0)
      .map((id) => {
        const prov = providerMap.get(id)
        const name = typeof prov?.name === 'string' ? prov.name : id

        const modelsRaw = (typeof prov?.models === 'object' && prov?.models !== null)
          ? prov.models as Record<string, Record<string, unknown>>
          : {}

        const models: ProviderModel[] = Object.entries(modelsRaw).map(([modelId, modelData]) => {
          const variantsRaw = (typeof modelData?.variants === 'object' && modelData?.variants !== null)
            ? modelData.variants as Record<string, Record<string, unknown>>
            : {}

          const variants: Record<string, ModelVariant> = {}
          for (const [vId, vData] of Object.entries(variantsRaw)) {
            variants[vId] = { id: vId, disabled: vData?.disabled === true }
          }

          return {
            id: modelId,
            name: typeof modelData?.name === 'string' ? modelData.name : modelId,
            variants,
          }
        })

        return { id, name, defaultModelId: defaults[id], models }
      })

    // Auto-select first available model if none set
    if (!currentModel.value && connectedProviders.value.length > 0) {
      const first = connectedProviders.value[0]
      const firstModel = first.models.find((m) => m.id === first.defaultModelId) ?? first.models[0]
      if (firstModel) {
        await selectModel(first.id, firstModel.id)
      }
    }
  } catch {
    loadError.value = t('chat.modelPicker.loadError')
  } finally {
    isLoading.value = false
  }
}

// ---------------------------------------------------------------------------
// UI interactions
// ---------------------------------------------------------------------------

function togglePopover() {
  if (isOpen.value) {
    isOpen.value = false
    return
  }
  isOpen.value = true
  void fetchProviders()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') isOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  void loadCurrentModel()
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

watch(() => props.client, (c) => {
  if (c) {
    void loadCurrentModel()
    void fetchProviders()
  }
}, { immediate: true })

// Expose variant for parent to pass to useChat
defineExpose({ currentVariant, currentModel })
</script>

<template>
  <div ref="pickerRef" class="mp" @keydown="handleKeydown">
    <div class="mp-controls">
      <button
        type="button"
        class="mp-pill"
        :class="{ 'is-open': isOpen }"
        :title="t('chat.modelPicker.title')"
        @click="togglePopover"
      >
        <svg class="mp-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        <span class="mp-pill-label">{{ displayLabel }}</span>
        <svg class="mp-pill-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <!-- Variant selector (thinking depth) — only when model supports it -->
      <div v-if="hasVariants" class="mp-variant-group">
        <button
          v-for="v in availableVariants"
          :key="v"
          type="button"
          class="mp-variant-chip"
          :class="{ 'is-active': currentVariant === v }"
          :title="`Thinking: ${v}`"
          @click="selectVariant(v)"
        >
          {{ v }}
        </button>
      </div>
    </div>

    <Transition name="mp-pop">
      <div v-if="isOpen" class="mp-popover">
        <div v-if="isLoading" class="mp-popover-empty">
          {{ t('chat.modelPicker.loading') }}
        </div>

        <div v-else-if="loadError" class="mp-popover-empty is-error">
          {{ loadError }}
        </div>

        <div v-else-if="connectedProviders.length === 0" class="mp-popover-empty">
          {{ t('chat.modelPicker.noProviders') }}
        </div>

        <template v-else>
          <div v-for="provider in connectedProviders" :key="provider.id" class="mp-group">
            <div class="mp-group-header">
              <span class="mp-group-dot" />
              <span class="mp-group-name">{{ provider.name }}</span>
            </div>
            <button
              v-for="model in provider.models"
              :key="model.id"
              type="button"
              class="mp-option"
              :class="{ 'is-selected': currentModel?.providerID === provider.id && currentModel?.modelID === model.id }"
              @click="selectModel(provider.id, model.id)"
            >
              <span class="mp-option-label">{{ model.name }}</span>
              <span v-if="model.id === provider.defaultModelId" class="mp-option-badge">{{ t('chat.modelPicker.defaultBadge') }}</span>
              <svg
                v-if="currentModel?.providerID === provider.id && currentModel?.modelID === model.id"
                class="mp-option-check"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mp {
  position: relative;
}

.mp-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mp-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  cursor: pointer;
  transition: color var(--speed-quick), border-color var(--speed-quick), background var(--speed-quick);
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
}

.mp-pill:hover,
.mp-pill.is-open {
  color: var(--text-1);
  border-color: var(--text-3);
  background: var(--surface-hover);
}

.mp-pill-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.mp-pill-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.mp-pill-chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.5;
  transition: transform var(--speed-quick);
}

.mp-pill.is-open .mp-pill-chevron {
  transform: rotate(180deg);
}

/* Variant chips (thinking depth) */
.mp-variant-group {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-active);
  border-radius: var(--r-full);
  border: 1px solid var(--border);
}

.mp-variant-chip {
  padding: 3px 8px;
  border: none;
  border-radius: var(--r-full);
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) 10px / 1 var(--font);
  cursor: pointer;
  text-transform: capitalize;
  transition: all var(--speed-quick);
  letter-spacing: .02em;
}

.mp-variant-chip:hover {
  color: var(--text-1);
}

.mp-variant-chip.is-active {
  background: var(--brand);
  color: #fff;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--brand) 40%, transparent);
}

/* Popover */
.mp-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 280px;
  max-width: 360px;
  background: var(--content-warm);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  overflow-y: auto;
  max-height: 360px;
  z-index: 100;
  padding: 4px;
}

.mp-popover-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-3);
  font: var(--text-micro) var(--font);
}

.mp-popover-empty.is-error {
  color: #ef4444;
}

/* Provider group */
.mp-group {
  padding: 2px 0;
}

.mp-group + .mp-group {
  border-top: 1px solid var(--border-subtle);
  margin-top: 2px;
  padding-top: 4px;
}

.mp-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 4px;
}

.mp-group-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--r-full);
  background: var(--brand);
  box-shadow: 0 0 6px color-mix(in srgb, var(--brand) 50%, transparent);
  flex-shrink: 0;
}

.mp-group-name {
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font);
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: .04em;
}

/* Model option */
.mp-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px 7px 27px;
  border: none;
  background: transparent;
  color: var(--text-2);
  font: var(--text-small) var(--font);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background var(--speed-quick);
  text-align: left;
}

.mp-option:hover {
  background: var(--surface-hover);
}

.mp-option.is-selected {
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  color: var(--text-1);
}

.mp-option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
}

.mp-option-badge {
  font: var(--fw-medium) 9px / 1 var(--font);
  color: var(--text-3);
  background: var(--surface-active);
  padding: 2px 5px;
  border-radius: var(--r-sm);
  letter-spacing: .02em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.mp-option-check {
  width: 14px;
  height: 14px;
  color: var(--brand);
  flex-shrink: 0;
}

/* Popover transition */
.mp-pop-enter-active,
.mp-pop-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.mp-pop-enter-from,
.mp-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}
</style>
