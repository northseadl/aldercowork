<script setup lang="ts">
/**
 * StreamingMarkdown — Adaptive Jitter Buffer + morphdom.
 *
 * Core idea: estimate the model's actual output rate (EMA), then drain the
 * buffer at that rate. This preserves the model's natural rhythm:
 * - Model thinking pause → buffer drains → user sees natural pause
 * - Model burst → buffer absorbs → steady drain (no speed spikes)
 * - Fast model → fast display; slow model → slow display
 *
 * Render throttle: max 25fps (40ms intervals) instead of 60fps.
 * Each render advances enough characters to be perceptible, cutting
 * markdown.render() + morphdom calls by 60%.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import morphdom from 'morphdom'
import { useMarkdown } from '../../composables/useMarkdown'

const props = defineProps<{
  text: string
  streaming: boolean
}>()

const markdown = useMarkdown()
const containerRef = ref<HTMLElement | null>()

// ---------------------------------------------------------------------------
// Arrival rate estimation (EMA over sliding window)
// ---------------------------------------------------------------------------

interface ArrivalEntry { time: number; chars: number }
const arrivalLog: ArrivalEntry[] = []
let estimatedRate = 150 // chars/sec — initial guess until we have data

const MIN_RATE = 60
const MAX_RATE = 1200

function recordArrival(chars: number) {
  const now = performance.now()
  arrivalLog.push({ time: now, chars })

  // Sliding window: keep last 800ms
  const cutoff = now - 800
  while (arrivalLog.length > 0 && arrivalLog[0].time < cutoff) {
    arrivalLog.shift()
  }

  if (arrivalLog.length >= 2) {
    const windowMs = now - arrivalLog[0].time
    const totalChars = arrivalLog.reduce((s, e) => s + e.chars, 0)
    if (windowMs > 30) {
      const raw = (totalChars / windowMs) * 1000
      estimatedRate = Math.max(MIN_RATE, Math.min(MAX_RATE, raw))
    }
  }
}

// ---------------------------------------------------------------------------
// Jitter buffer — drain at estimated model rate
// ---------------------------------------------------------------------------

const displayedLength = ref(props.text.length)
let pendingLength = props.text.length // Internal counter, not reactive
let rafId: number | null = null
let lastFrameTime = 0
let lastRenderTime = 0

const RENDER_INTERVAL_MS = 40 // Commit to reactive state every 40ms (25fps)

function tick(now: number) {
  const dt = lastFrameTime > 0 ? now - lastFrameTime : 16
  lastFrameTime = now

  // Tab-switch recovery: >500ms gap → snap to current
  if (dt > 500) {
    pendingLength = props.text.length
    displayedLength.value = pendingLength
    rafId = null
    return
  }

  const rawLen = props.text.length
  const gap = rawLen - pendingLength

  // Drain buffer at estimated model rate (slight 1.05x overdrain to prevent stalling)
  if (gap > 0) {
    const charsThisFrame = Math.max(1, Math.round(estimatedRate * 1.05 * dt / 1000))
    pendingLength = Math.min(pendingLength + charsThisFrame, rawLen)
  }

  // Throttle: commit to reactive state at 25fps, or when fully caught up
  if (now - lastRenderTime >= RENDER_INTERVAL_MS || pendingLength >= rawLen) {
    displayedLength.value = pendingLength
    lastRenderTime = now
  }

  // Keep ticking if buffer not fully drained
  if (pendingLength < rawLen || displayedLength.value < pendingLength) {
    rafId = requestAnimationFrame(tick)
  } else {
    rafId = null
  }
}

function ensureTicking() {
  if (rafId !== null) return
  rafId = requestAnimationFrame(tick)
}

// Track text growth → record arrival + start draining
watch(() => props.text.length, (newLen, oldLen) => {
  const delta = (newLen ?? 0) - (oldLen ?? 0)
  if (delta > 0 && props.streaming) {
    recordArrival(delta)
    ensureTicking()
  }
  // Non-streaming text change (e.g. reconcile after stream) → snap
  if (!props.streaming && !rafId) {
    pendingLength = newLen ?? 0
    displayedLength.value = pendingLength
  }
})

// Streaming ended: let remaining buffer drain naturally at last known rate
watch(() => props.streaming, (streaming) => {
  if (!streaming) {
    const remaining = (props.text?.length ?? 0) - pendingLength
    if (remaining > 0) {
      ensureTicking() // Keep draining at estimated rate
    } else {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      pendingLength = props.text?.length ?? 0
      displayedLength.value = pendingLength
    }
  }
})

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  arrivalLog.length = 0
})

// ---------------------------------------------------------------------------
// Safe slice — hold back partial code fences
// ---------------------------------------------------------------------------

function safeSlicePoint(text: string, target: number): number {
  if (target >= text.length) return text.length
  const lastNewline = text.lastIndexOf('\n', target - 1)
  if (lastNewline === -1) return target
  const lastLine = text.slice(lastNewline + 1, target)
  if (lastLine.trimStart().startsWith('```')) return lastNewline
  return target
}

// ---------------------------------------------------------------------------
// Markdown render (throttled by displayedLength's 25fps update rate)
// ---------------------------------------------------------------------------

const renderedHtml = computed(() => {
  if (!props.text) return ''

  const shouldSlice = displayedLength.value < props.text.length
  const target = shouldSlice
    ? safeSlicePoint(props.text, displayedLength.value)
    : props.text.length

  const text = target >= props.text.length
    ? props.text
    : props.text.slice(0, target)

  return text ? markdown.render(text) : ''
})

// ---------------------------------------------------------------------------
// DOM patching — morphdom incremental update
// ---------------------------------------------------------------------------

let lastHtml = ''
let initialRenderDone = false
const morphdomWrapper = document.createElement('div')

function patchDom(html: string) {
  const el = containerRef.value
  if (!el || html === lastHtml) return
  lastHtml = html

  if (!initialRenderDone) {
    el.innerHTML = html
    initialRenderDone = true
    return
  }

  morphdomWrapper.innerHTML = html
  morphdom(el, morphdomWrapper, {
    childrenOnly: true,
    onNodeAdded(node) {
      if (node instanceof HTMLElement) {
        node.classList.add('morph-new')
      }
      return node
    },
  })
}

watch(renderedHtml, (html) => patchDom(html), { flush: 'post' })

watch(containerRef, (el) => {
  if (el && renderedHtml.value) {
    patchDom(renderedHtml.value)
  }
}, { immediate: true })
</script>

<template>
  <div ref="containerRef" class="markdown-content streaming-markdown" />
</template>
