/**
 * Skill import and discovery composable.
 *
 * Provides real skill scanning from the filesystem via Tauri IPC:
 * - Scan skills directory for installed skills
 * - Parse SKILL.md (YAML frontmatter) and skill.yaml
 * - Import from archive or Git repository
 * - Remove installed skills
 */
import { ref, readonly } from 'vue'
import { defaultManifest, type SkillDirEntry, type SkillManifest } from '@aldercowork/skill-schema'
import type { SkillPanelSkill } from '../components/skills'

// ---------------------------------------------------------------------------
// Tauri IPC helpers
// ---------------------------------------------------------------------------

function isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauriRuntime()) {
        throw new Error(`Skill operations require Tauri runtime (command: ${cmd})`)
    }
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return tauriInvoke<T>(cmd, args)
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser (zero-dependency, handles SKILL.md format)
// ---------------------------------------------------------------------------

interface FrontmatterResult {
    name?: string
    description?: string
    body: string
}

function parseFrontmatter(raw: string): FrontmatterResult {
    const lines = raw.split('\n')
    if (lines[0]?.trim() !== '---') {
        return { body: raw }
    }

    const endIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (endIndex < 0) {
        return { body: raw }
    }

    const frontmatterLines = lines.slice(1, endIndex)
    const body = lines.slice(endIndex + 1).join('\n').trim()

    let name: string | undefined
    let description: string | undefined

    for (const line of frontmatterLines) {
        const nameMatch = line.match(/^name:\s*(.+)/)
        if (nameMatch) {
            name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '')
        }
        const descMatch = line.match(/^description:\s*(.+)/)
        if (descMatch) {
            description = descMatch[1].trim().replace(/^['"]|['"]$/g, '')
        }
    }

    return { name, description, body }
}

// ---------------------------------------------------------------------------
// skill.yaml parser (lightweight YAML subset — covers flat + nested keys)
// ---------------------------------------------------------------------------

function parseSkillYaml(raw: string): Partial<SkillManifest> {
    const result: Record<string, unknown> = {}
    const lines = raw.split('\n')
    let currentKey = ''

    for (const line of lines) {
        // Skip comments and blanks
        if (line.trim().startsWith('#') || line.trim() === '') continue

        // Top-level key: value
        const kvMatch = line.match(/^(\w[\w_]*):\s*(.*)/)
        if (kvMatch) {
            const [, key, value] = kvMatch
            const trimmed = value.trim()

            if (trimmed === '' || trimmed === '{}' || trimmed === '[]') {
                currentKey = key
                if (trimmed === '{}') result[key] = {}
                else if (trimmed === '[]') result[key] = []
                continue
            }

            // Inline value
            const parsed = parseYamlValue(trimmed)
            result[key] = parsed
            currentKey = key
            continue
        }

        // Nested list item: - value
        const listMatch = line.match(/^\s+-\s+(.+)/)
        if (listMatch && currentKey) {
            if (!Array.isArray(result[currentKey])) {
                result[currentKey] = []
            }
            ; (result[currentKey] as unknown[]).push(parseYamlValue(listMatch[1].trim()))
            continue
        }

        // Nested key: value (under current parent)
        const nestedMatch = line.match(/^\s+(\w[\w_]*):\s*(.*)/)
        if (nestedMatch && currentKey) {
            if (typeof result[currentKey] !== 'object' || Array.isArray(result[currentKey])) {
                result[currentKey] = {}
            }
            const nested = result[currentKey] as Record<string, unknown>
            const val = nestedMatch[2].trim()
            if (val === '' || val === '[]') {
                nested[nestedMatch[1]] = val === '[]' ? [] : {}
            } else {
                nested[nestedMatch[1]] = parseYamlValue(val)
            }
        }
    }

    return result as unknown as Partial<SkillManifest>
}

function parseYamlValue(raw: string): string | number | boolean {
    // Remove quotes
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        return raw.slice(1, -1)
    }
    if (raw === 'true') return true as unknown as string
    if (raw === 'false') return false as unknown as string
    const num = Number(raw)
    if (!Number.isNaN(num) && raw !== '') return num as unknown as string
    return raw
}

// ---------------------------------------------------------------------------
// Core scanning logic
// ---------------------------------------------------------------------------

async function scanSkillDir(entry: SkillDirEntry): Promise<SkillPanelSkill | null> {
    let manifest: SkillManifest = defaultManifest(entry.id)
    let preview = ''
    let description = ''
    let name = entry.id

    // Parse skill.yaml if it exists (machine-readable contract, takes priority)
    if (entry.hasSkillYaml) {
        try {
            const yamlRaw = await invoke<string>('read_skill_file', {
                skillId: entry.id,
                relativePath: 'skill.yaml',
            })
            if (yamlRaw) {
                const parsed = parseSkillYaml(yamlRaw)
                manifest = { ...manifest, ...parsed, id: parsed.id || entry.id }
            }
        } catch {
            // Fall through to defaults
        }
    }

    // Parse SKILL.md for human-readable name/description + preview text
    if (entry.hasSkillMd) {
        try {
            const mdRaw = await invoke<string>('read_skill_file', {
                skillId: entry.id,
                relativePath: 'SKILL.md',
            })
            if (mdRaw) {
                const fm = parseFrontmatter(mdRaw)
                if (fm.name) name = fm.name
                if (fm.description) description = fm.description
                // Preview text for detail panel markdown rendering
                preview = fm.body.slice(0, 2000)
            }
        } catch {
            // Fall through
        }
    }

    // Must have at least SKILL.md to be a valid skill
    if (!entry.hasSkillMd && !entry.hasSkillYaml) {
        return null
    }

    return {
        ...manifest,
        name: name || manifest.id,
        description: description || '',
        installed: true,
        activation: { global: false, workspace: false },
        preview,
        toolsToCall: [],
    }
}

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

const scanning = ref(false)
const importing = ref(false)
const importError = ref<string | null>(null)

export function useSkillImport() {
    /** Scan the skills directory and return all discovered skills */
    async function scanAllSkills(): Promise<SkillPanelSkill[]> {
        scanning.value = true
        try {
            const dirs = await invoke<SkillDirEntry[]>('list_skill_dirs')
            const results = await Promise.all(dirs.map(scanSkillDir))
            return results.filter((s): s is SkillPanelSkill => s !== null)
        } finally {
            scanning.value = false
        }
    }

    /** Import a skill from a local archive file */
    async function importFromArchive(): Promise<string | null> {
        importing.value = true
        importError.value = null
        try {
            const archivePath = await invoke<string | null>('select_skill_archive')
            if (!archivePath) return null

            const skillName = await invoke<string>('import_skill_archive', { archivePath })
            return skillName
        } catch (error: unknown) {
            importError.value = error instanceof Error ? error.message : String(error)
            throw error
        } finally {
            importing.value = false
        }
    }

    /** Import a skill from a Git repository URL */
    async function importFromGit(repoUrl: string): Promise<string> {
        importing.value = true
        importError.value = null
        try {
            const skillName = await invoke<string>('import_skill_git', { repoUrl })
            return skillName
        } catch (error: unknown) {
            importError.value = error instanceof Error ? error.message : String(error)
            throw error
        } finally {
            importing.value = false
        }
    }

    /** Remove an installed skill by ID */
    async function removeSkill(skillId: string): Promise<void> {
        await invoke('remove_skill', { skillId })
    }

    return {
        scanning: readonly(scanning),
        importing: readonly(importing),
        importError: readonly(importError),
        scanAllSkills,
        importFromArchive,
        importFromGit,
        removeSkill,
    }
}
