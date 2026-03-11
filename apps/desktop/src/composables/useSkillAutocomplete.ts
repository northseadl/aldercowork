/**
 * useSkillAutocomplete — shared @ skill mention logic for textarea editors.
 *
 * Encapsulates: popover state, filtered list, keyboard nav, cursor-adaptive
 * positioning, and text insertion. Used by WorkflowEditor and RunbookEditor.
 */
import { computed, onMounted, ref, type Ref } from 'vue'

import { useInstalledSkillStore } from '../stores/installedSkill'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillPopoverPos {
    top: number
    left: number
}

// ---------------------------------------------------------------------------
// Adaptive position utility
// ---------------------------------------------------------------------------

const POP_H = 200
const POP_W = 320
const CHAR_WIDTH = 8

/** Compute adaptive popover position — avoids overlap and flips on container edges */
function computePopoverPos(el: HTMLTextAreaElement, before: string): SkillPopoverPos {
    const linesBefore = before.split('\n')
    const cursorLine = linesBefore.length - 1
    const cursorCol = linesBefore[linesBefore.length - 1]?.length ?? 0
    const style = getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight) || 22
    const padTop = parseFloat(style.paddingTop) || 0
    const padLeft = parseFloat(style.paddingLeft) || 0
    const borderTop = parseFloat(style.borderTopWidth) || 0

    // Cursor position relative to wrapper, accounting for scroll
    const cursorTop = borderTop + padTop + cursorLine * lineHeight - el.scrollTop
    const cursorLeft = padLeft + Math.min(cursorCol * CHAR_WIDTH, 300)

    const wrap = el.parentElement
    const wrapH = wrap?.clientHeight ?? el.clientHeight
    const wrapW = wrap?.clientWidth ?? el.clientWidth

    // Vertical: prefer below cursor line, flip above if insufficient space
    const spaceBelow = wrapH - (cursorTop + lineHeight)
    const top = spaceBelow >= POP_H + 4
        ? cursorTop + lineHeight + 4
        : Math.max(4, cursorTop - POP_H - 4)

    // Horizontal: align to cursor column, clamp within container
    let left = cursorLeft
    if (left + POP_W > wrapW) left = Math.max(4, wrapW - POP_W - 4)

    return { top, left }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export interface UseSkillAutocompleteOptions {
    /** Ref to the <textarea> element */
    textareaRef: Ref<HTMLTextAreaElement | null>
    /** Ref to the local text model (v-model of textarea) */
    localValue: Ref<string>
    /** Callback after a skill is inserted (emit update) */
    onUpdate: (value: string) => void
}

export function useSkillAutocomplete(options: UseSkillAutocompleteOptions) {
    const { textareaRef, localValue, onUpdate } = options
    const store = useInstalledSkillStore()

    // Ensure skills are loaded
    onMounted(() => {
        if (store.skills.length === 0 && !store.loading) {
            void store.loadAll()
        }
    })

    // --- State ---
    const show = ref(false)
    const query = ref('')
    const pos = ref<SkillPopoverPos>({ top: 0, left: 0 })
    const selectedIndex = ref(0)

    const filteredSkills = computed(() => {
        const all = store.skills
        const q = query.value.toLowerCase()
        if (!q) return all.slice(0, 10)
        return all
            .filter((s) => s.displayName.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
            .slice(0, 10)
    })

    // --- Handlers ---

    function handleKeydown(e: KeyboardEvent) {
        if (!show.value) return
        if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex.value = Math.min(selectedIndex.value + 1, filteredSkills.value.length - 1); return }
        if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex.value = Math.max(selectedIndex.value - 1, 0); return }
        if (e.key === 'Enter') { e.preventDefault(); insertSkillRef(filteredSkills.value[selectedIndex.value]?.id); return }
        if (e.key === 'Escape') { e.preventDefault(); show.value = false; return }
    }

    function handleKeyup() {
        const el = textareaRef.value
        if (!el) return

        const cursor = el.selectionStart ?? 0
        const before = el.value.slice(0, cursor)
        const atIdx = before.lastIndexOf('@')

        if (atIdx < 0 || (atIdx > 0 && before[atIdx - 1] !== ' ' && before[atIdx - 1] !== '\n')) {
            show.value = false
            return
        }

        const fragment = before.slice(atIdx + 1)
        if (fragment.includes(' ') || fragment.includes('\n')) {
            show.value = false
            return
        }

        query.value = fragment
        selectedIndex.value = 0
        pos.value = computePopoverPos(el, before)
        show.value = true
    }

    function insertSkillRef(skillId?: string) {
        if (!skillId || !textareaRef.value) {
            show.value = false
            return
        }

        const el = textareaRef.value
        const cursor = el.selectionStart ?? 0
        const before = el.value.slice(0, cursor)
        const after = el.value.slice(cursor)
        const atIdx = before.lastIndexOf('@')
        if (atIdx < 0) return

        const newBefore = before.slice(0, atIdx) + `@${skillId}`
        localValue.value = newBefore + ' ' + after
        show.value = false
        onUpdate(localValue.value)

        // Restore cursor after insertion
        const newCursor = newBefore.length + 1
        // nextTick is handled by the caller or Vue's reactivity
        requestAnimationFrame(() => {
            el.focus()
            el.setSelectionRange(newCursor, newCursor)
        })
    }

    return {
        show,
        query,
        pos,
        selectedIndex,
        filteredSkills,
        handleKeydown,
        handleKeyup,
        insertSkillRef,
    }
}
