<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  language: string
  code: string
}>()

const copyLabel = ref('Copy')
let copyLabelResetTimer: number | undefined

const INLINE_MARKUP_PATTERN = /<\/?[a-z][\s\S]*>/i
const ALLOWED_HIGHLIGHT_CLASSES = new Set(['kw', 'str', 'fn', 'cm', 'hljs'])

const hasInlineMarkup = computed(() => INLINE_MARKUP_PATTERN.test(props.code))

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

const isAllowedHighlightClass = (className: string): boolean => {
  return ALLOWED_HIGHLIGHT_CLASSES.has(className) || className.startsWith('hljs-')
}

function sanitizeCodeMarkup(input: string): { html: string; text: string } {
  if (typeof document === 'undefined') {
    return { html: escapeHtml(input), text: input }
  }

  const template = document.createElement('template')
  template.innerHTML = input

  const visitNode = (node: Node): { html: string; text: string } => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      return { html: escapeHtml(text), text }
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return { html: '', text: '' }
    }

    const element = node as HTMLElement
    const tagName = element.tagName.toLowerCase()

    if (tagName === 'br') {
      return { html: '<br>', text: '\n' }
    }

    if (tagName === 'span') {
      const classNames = Array.from(element.classList).filter(isAllowedHighlightClass)
      if (classNames.length === 0) {
        const rawMarkup = element.outerHTML
        return {
          html: escapeHtml(rawMarkup),
          text: rawMarkup,
        }
      }

      const children = Array.from(element.childNodes).map(visitNode)
      const childrenHtml = children.map((child) => child.html).join('')
      const childrenText = children.map((child) => child.text).join('')
      return {
        html: `<span class="${classNames.join(' ')}">${childrenHtml}</span>`,
        text: childrenText,
      }
    }

    const rawMarkup = element.outerHTML
    return {
      html: escapeHtml(rawMarkup),
      text: rawMarkup,
    }
  }

  const fragments = Array.from(template.content.childNodes).map(visitNode)
  return {
    html: fragments.map((fragment) => fragment.html).join(''),
    text: fragments.map((fragment) => fragment.text).join(''),
  }
}

const renderedPayload = computed(() => {
  if (!hasInlineMarkup.value) {
    return {
      html: escapeHtml(props.code),
      text: props.code,
    }
  }

  return sanitizeCodeMarkup(props.code)
})

const renderedCode = computed(() => renderedPayload.value.html)
const plainCode = computed(() => renderedPayload.value.text)

const resetCopyLabel = () => {
  if (copyLabelResetTimer !== undefined) {
    window.clearTimeout(copyLabelResetTimer)
  }

  copyLabelResetTimer = window.setTimeout(() => {
    copyLabel.value = 'Copy'
  }, 1200)
}

const fallbackCopy = (value: string) => {
  const tempTextarea = document.createElement('textarea')
  tempTextarea.value = value
  tempTextarea.setAttribute('readonly', 'true')
  tempTextarea.style.position = 'fixed'
  tempTextarea.style.opacity = '0'

  document.body.appendChild(tempTextarea)
  tempTextarea.select()
  document.execCommand('copy')
  document.body.removeChild(tempTextarea)
}

const copyCode = async () => {
  const payload = plainCode.value
  if (!payload) {
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload)
    } else {
      fallbackCopy(payload)
    }

    copyLabel.value = 'Copied'
    resetCopyLabel()
  } catch {
    copyLabel.value = 'Copy failed'
    resetCopyLabel()
  }
}

onBeforeUnmount(() => {
  if (copyLabelResetTimer !== undefined) {
    window.clearTimeout(copyLabelResetTimer)
  }
})
</script>

<template>
  <figure class="codeblock">
    <figcaption class="cb-head">
      <span>{{ props.language }}</span>
      <button type="button" class="cb-copy" @click="copyCode">{{ copyLabel }}</button>
    </figcaption>

    <pre><code v-html="renderedCode" /></pre>
  </figure>
</template>

<style scoped>
.codeblock {
  border-radius: var(--r-lg);
  overflow: hidden;
  margin: calc(var(--sp) * 2) 0;
  background: var(--code-bg);
  box-shadow: var(--shadow-card);
}

.cb-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sp);
  padding: 8px 14px;
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  background: var(--surface-card);
}

.cb-copy {
  font: var(--text-micro) var(--font);
  color: var(--text-3);
  background: 0;
  border: 0;
  padding: 3px 8px;
  border-radius: var(--r-sm);
  transition: background var(--speed-quick) var(--ease), color var(--speed-quick) var(--ease);
}

.cb-copy:hover {
  background: var(--surface-hover);
  color: var(--text-2);
}

pre {
  padding: calc(var(--sp) * 2);
  font: var(--text-mini) / var(--lh-relaxed) var(--font-mono);
  color: var(--text-1);
  overflow-x: auto;
}

code {
  display: block;
  white-space: pre;
}

.codeblock :deep(.kw) {
  color: var(--brand);
}

.codeblock :deep(.str) {
  color: var(--syntax-string);
}

.codeblock :deep(.fn) {
  color: var(--syntax-function);
}

.codeblock :deep(.cm) {
  color: var(--text-3);
}
</style>
