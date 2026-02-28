import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'

// Register only the languages we care about to keep bundle weight down
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import diff from 'highlight.js/lib/languages/diff'
import markdown from 'highlight.js/lib/languages/markdown'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)

const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight(str: string, lang: string): string {
        const displayLang = lang || 'text'
        const escaped = lang && hljs.getLanguage(lang)
            ? hljs.highlight(str, { language: lang }).value
            : md.utils.escapeHtml(str)

        return [
            '<pre class="codeblock">',
            `<div class="cb-head"><span>${md.utils.escapeHtml(displayLang)}</span><button class="cb-copy" type="button">Copy</button></div>`,
            `<code class="hljs">${escaped}</code>`,
            '</pre>',
        ].join('')
    },
})

// Open external links in new tab
const defaultRender = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') ?? ''
    if (href.startsWith('http')) {
        tokens[idx].attrSet('target', '_blank')
        tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
    return defaultRender(tokens, idx, options, env, self)
}

export function useMarkdown() {
    function render(source: string): string {
        return md.render(source)
    }

    return { render }
}

/**
 * Global click delegate for code-block copy buttons.
 * Call once at app startup (e.g. in main.ts or App.vue onMounted).
 */
let copyDelegateInstalled = false
let copyDelegateHandler: ((event: MouseEvent) => void) | null = null

function removeCopyDelegate() {
    if (!copyDelegateInstalled || !copyDelegateHandler) return
    document.removeEventListener('click', copyDelegateHandler)
    copyDelegateHandler = null
    copyDelegateInstalled = false
}

export function installCopyDelegate(): () => void {
    if (copyDelegateInstalled) {
        return removeCopyDelegate
    }

    copyDelegateHandler = (e: MouseEvent) => {
        const btn = (e.target as Element).closest?.('.cb-copy')
        if (!btn) {
            return
        }

        const code = btn.closest('.codeblock')?.querySelector('code')?.textContent
        if (!code) {
            return
        }

        void navigator.clipboard.writeText(code).then(() => {
            btn.textContent = 'Copied!'
            setTimeout(() => {
                btn.textContent = 'Copy'
            }, 2000)
        })
    }

    document.addEventListener('click', copyDelegateHandler)
    copyDelegateInstalled = true

    return removeCopyDelegate
}
