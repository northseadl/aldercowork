<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { useDialogA11y } from '../../composables/useDialogA11y'
import { useI18n } from '../../i18n'
import { useAppStore } from '../../stores/app'
import { useSessionStore } from '../../stores/session'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const sessionStore = useSessionStore()

const inputRef = ref<HTMLInputElement | null>(null)
const paletteRef = ref<HTMLElement | null>(null)
const query = ref('')
const selectedIndex = ref(0)
const searchInputId = 'command-palette-search'

interface CommandAction {
  id: string
  title: string
  icon: string
  handler: () => void | Promise<void>
}

// Map app routes and actions
const actions = computed<CommandAction[]>(() => {
  return [
    {
      id: 'new-chat',
      title: t('chat.empty.title'),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      handler: async () => {
        const id = await sessionStore.createSession()
        sessionStore.selectSession(id)
        void router.push('/')
      },
    },
    {
      id: 'go-sessions',
      title: t('nav.sessions'),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
      handler: () => { appStore.navigateTo('sessions'); void router.push('/') },
    },
    {
      id: 'go-skills',
      title: t('nav.skills'),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
      handler: () => { appStore.navigateTo('skills'); void router.push('/skills') },
    },
    {
      id: 'go-settings',
      title: t('nav.settings'),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
      handler: () => { appStore.navigateTo('settings'); void router.push('/settings') },
    },
  ]
})

const filteredActions = computed(() => {
  if (!query.value.trim()) return actions.value
  const lowerQuery = query.value.toLowerCase()
  return actions.value.filter((action) => action.title.toLowerCase().includes(lowerQuery))
})

// Navigation logic
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    query.value = ''
    selectedIndex.value = 0
    void nextTick(() => inputRef.value?.focus())
  }
})

watch(query, () => {
  selectedIndex.value = 0
})

const paletteOpen = computed(() => props.modelValue)

useDialogA11y({
  open: paletteOpen,
  containerRef: paletteRef,
  initialFocusRef: inputRef as unknown as Ref<HTMLElement | null>,
  onEscape: () => emit('update:modelValue', false),
})

const executeAction = (action: CommandAction) => {
  emit('update:modelValue', false)
  void action.handler()
}

	const handleKeydown = (e: KeyboardEvent) => {
	  if (e.key === 'Escape') {
	    emit('update:modelValue', false)
	    return
	  }

  if (filteredActions.value.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % filteredActions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + filteredActions.value.length) % filteredActions.value.length
  } else if (e.key === 'Enter' && filteredActions.value.length > 0) {
    e.preventDefault()
    executeAction(filteredActions.value[selectedIndex.value])
  }
	}

	// Global hotkey Registration
	function isEditableTarget(target: EventTarget | null): boolean {
	  const el = target instanceof HTMLElement ? target : null
	  if (!el) return false

	  const tag = el.tagName.toLowerCase()
	  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
	  return el.isContentEditable
	}

	const handleGlobalKeydown = (e: KeyboardEvent) => {
	  // Cmd+K or Ctrl+K to open palette (only if we're not inside it and not blocked by form input, unless we globally want it)
	  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
	    // Avoid hijacking keybindings while typing, but still allow closing when palette is open.
	    if (!props.modelValue && isEditableTarget(e.target)) return
	    e.preventDefault()
	    emit('update:modelValue', !props.modelValue)
	  }
	}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="props.modelValue" class="cmd-overlay" role="presentation" @click.self="emit('update:modelValue', false)">
      <div ref="paletteRef" class="cmd-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title" tabindex="-1" @click.stop>
        <h2 id="command-palette-title" class="sr-only">{{ t('commandPalette.title') }}</h2>
        <div class="cmd-header">
          <label class="sr-only" :for="searchInputId">{{ t('commandPalette.searchLabel') }}</label>
          <input
            :id="searchInputId"
            ref="inputRef"
            v-model="query"
            type="text"
            class="cmd-input"
            :placeholder="t('commandPalette.searchPlaceholder')"
            @keydown="handleKeydown"
          >
        </div>
        
        <div class="cmd-body" v-if="filteredActions.length > 0">
          <button
            v-for="(action, index) in filteredActions"
            :key="action.id"
            class="cmd-item"
            :class="{ 'is-active': index === selectedIndex }"
            type="button"
            @mouseenter="selectedIndex = index"
            @click="executeAction(action)"
          >
            <span class="cmd-item-icon" v-html="action.icon"></span>
            <span class="cmd-item-title">{{ action.title }}</span>
          </button>
        </div>
        
        <div v-else class="cmd-empty">
          {{ t('commandPalette.empty') }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cmd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 15vh;
  animation: fade-in var(--speed-regular) var(--ease);
}

.cmd-palette {
  width: 100%;
  max-width: 580px;
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slide-down var(--speed-regular) var(--ease);
}

.cmd-header {
  padding: calc(var(--sp) * 2);
  border-bottom: 1px solid var(--border-subtle);
}

.cmd-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font: var(--text-large) var(--font);
  color: var(--text-1);
}

.cmd-input::placeholder {
  color: var(--text-3);
}

.cmd-body {
  max-height: 380px;
  overflow-y: auto;
  padding: calc(var(--sp) * 1);
}

.cmd-item {
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1.5);
  padding: calc(var(--sp) * 1.5) calc(var(--sp) * 2);
  border: none;
  background: transparent;
  color: var(--text-2);
  font: var(--text-regular) var(--font);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background var(--speed-quick);
}

.cmd-item.is-active {
  background: var(--brand);
  color: #fff;
}

.cmd-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.cmd-item-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.cmd-empty {
  padding: calc(var(--sp) * 4) 0;
  text-align: center;
  color: var(--text-3);
  font: var(--text-small) var(--font);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
  white-space: nowrap;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-down {
  from { opacity: 0; transform: translateY(-20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
