<script setup lang="ts">
import { ref, computed } from 'vue'

import { useI18n } from '../../i18n'
import ThemeToggle from './ThemeToggle.vue'

export interface NavItem {
  id: string
  label: string
  icon: string
  count?: number
  shortcut?: string
}

export interface Session {
  id: string
  name: string
  time: string
  active?: boolean
  live?: boolean
}

interface Props {
  navItems: NavItem[]
  sessions: Session[]
  activeNavId?: string
  activeSessionId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'select-nav': [id: string]
  'select-session': [id: string]
  'delete-session': [id: string]
  'create-session': []
}>()

const { t } = useI18n()

const resolvedActiveNavId = computed(() => props.activeNavId ?? props.navItems[0]?.id ?? '')

const resolvedActiveSessionId = computed(() => {
  if (props.activeSessionId) return props.activeSessionId
  return props.sessions.find((s) => s.active)?.id ?? props.sessions[0]?.id ?? ''
})

const resolveIconPaths = (iconPath: string): string[] => {
  return iconPath.split('|').map((s) => s.trim()).filter(Boolean)
}

// Delete: fade out then emit
const deletingIds = ref<Set<string>>(new Set())

async function handleDelete(id: string) {
  deletingIds.value.add(id)
  deletingIds.value = new Set(deletingIds.value)
  // Match CSS transition duration
  await new Promise((r) => setTimeout(r, 200))
  deletingIds.value.delete(id)
  deletingIds.value = new Set(deletingIds.value)
  emit('delete-session', id)
}

const selectNav = (id: string) => emit('select-nav', id)
const selectSession = (id: string) => emit('select-session', id)

function handleSessionKeydown(event: KeyboardEvent, sessionId: string) {
  if (event.currentTarget !== event.target) {
    return
  }

  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  selectSession(sessionId)
}
</script>

<template>
  <nav class="sidebar" :aria-label="t('nav.sidebar')">
    <div class="side-section">
      <button
        v-for="item in props.navItems"
        :key="item.id"
        type="button"
        class="side-item"
        :class="{ active: item.id === resolvedActiveNavId }"
        :aria-current="item.id === resolvedActiveNavId ? 'page' : undefined"
        :title="item.shortcut ? `${item.label} (${item.shortcut})` : item.label"
        @click="selectNav(item.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path v-for="path in resolveIconPaths(item.icon)" :key="path" :d="path" />
        </svg>
        <span class="lbl">{{ item.label }}</span>
        <span v-if="typeof item.count === 'number'" class="cnt">{{ item.count }}</span>
        <span v-if="item.shortcut" class="k">{{ item.shortcut }}</span>
      </button>
    </div>

    <div class="side-label-row">
      <div class="side-label">{{ t('nav.recent') }}</div>
      <button
        type="button"
        class="side-new-btn"
        :title="t('nav.newSession')"
        :aria-label="t('nav.newSession')"
        @click="emit('create-session')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14" /><path d="M5 12h14" />
        </svg>
      </button>
    </div>

    <div class="sessions" :aria-label="t('nav.recentSessions')">
      <div
        v-for="session in props.sessions"
        :key="session.id"
        role="button"
        tabindex="0"
        class="sess"
        :class="{
          on: session.id === resolvedActiveSessionId,
          deleting: deletingIds.has(session.id),
        }"
        :title="session.name"
        @click="selectSession(session.id)"
        @keydown="handleSessionKeydown($event, session.id)"
      >
        <span class="dot" :class="session.live ? 'live' : 'off'" />
        <span class="nm">{{ session.name }}</span>
        <span class="tm">{{ session.time }}</span>
        <button
          type="button"
          class="sess-del"
          :title="t('nav.deleteSession')"
          :aria-label="t('nav.deleteSession')"
          @click.stop="handleDelete(session.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>

    <div class="side-foot">
      <button type="button" class="sf-btn" :title="t('settings.settingsShortcut')" @click="emit('select-nav', 'settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>
      <span class="sf-spacer" />
      <ThemeToggle />
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  grid-column: 1;
  grid-row: 2;
  background: var(--shell-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* ── Nav ── */

.side-section {
  padding: calc(var(--sp) * 1.5) var(--sp);
}

.side-item {
  width: 100%;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1.25);
  padding: 10px 12px;
  border-radius: var(--r-lg);
  font-size: var(--text-small);
  font-weight: var(--fw-medium);
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--speed-quick), color var(--speed-quick);
  user-select: none;
  text-align: left;
}

.side-item:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.side-item.active {
  background: var(--brand-subtle);
  color: var(--text-1);
}

.side-item svg {
  width: 18px;
  height: 18px;
  color: var(--text-3);
  flex-shrink: 0;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: color var(--speed-quick), transform var(--speed-quick);
}

.side-item:hover svg {
  transform: translateX(1px);
}

.side-item.active svg { color: var(--brand); }
.side-item .lbl { flex: 1; }

.side-item .cnt {
  font-size: var(--text-micro);
  color: var(--text-3);
  font-family: var(--font-mono);
}

.side-item .k {
  font-size: 11px;
  color: var(--text-4);
  font-family: var(--font-mono);
  opacity: 0;
  transition: opacity var(--speed-quick);
}

.side-item:hover .k { opacity: 1; }

/* ── Label ── */

.side-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--sp) * 2) 12px calc(var(--sp) * 0.75);
}

.side-label {
  font-size: var(--text-micro);
  font-weight: var(--fw-medium);
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.side-new-btn {
  width: 22px;
  height: 22px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color var(--speed-quick), background var(--speed-quick);
}

.side-new-btn:hover {
  color: var(--brand);
  background: var(--brand-subtle);
}

.side-new-btn svg { width: 14px; height: 14px; }

/* ── Sessions ── */

.sessions {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--sp);
}

.sess {
  width: 100%;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1.25);
  padding: 8px 12px;
  border-radius: var(--r-lg);
  font-size: var(--text-small);
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--speed-quick), color var(--speed-quick), opacity var(--speed-regular);
  margin-bottom: 1px;
  text-align: left;
}

.sess:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.sess.on {
  background: var(--brand-subtle);
  color: var(--text-1);
  font-weight: var(--fw-medium);
}

.sess:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

/* Delete fade-out */
.sess.deleting {
  opacity: 0;
  pointer-events: none;
}

.sess .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sess .dot.live { background: var(--brand); }
.sess .dot.off  { background: var(--text-4); }

.sess .nm {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sess .tm {
  font-size: 10px;
  color: var(--text-4);
  font-family: var(--font-mono);
  transition: opacity var(--speed-quick);
}

.sess-del {
  display: none;
  width: 22px;
  height: 22px;
  border: 0;
  background: transparent;
  color: var(--text-4);
  border-radius: var(--r-sm);
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  padding: 0;
  transition: color var(--speed-quick), background var(--speed-quick);
}

.sess-del svg { width: 12px; height: 12px; }

.sess-del:hover {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
}

.sess:hover .tm { display: none; }
.sess:hover .sess-del { display: flex; }
.sess:focus-within .tm { display: none; }
.sess:focus-within .sess-del { display: flex; }

/* ── Footer ── */

.side-foot {
  padding: calc(var(--sp) * 1.5);
  display: flex;
  align-items: center;
  gap: 4px;
}

.sf-spacer { flex: 1; }

.sf-btn {
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--speed-quick), color var(--speed-quick);
}

.sf-btn:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.sf-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.sf-btn svg { width: 16px; height: 16px; }

@media (max-width: 768px) {
  .sidebar { display: none; }
}
</style>
