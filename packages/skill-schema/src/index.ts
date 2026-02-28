export interface SkillManifest {
  id: string
  version: string
  publisher: string
  license: string
  entry: 'instruction' | 'script'
  permissions: {
    fs?: ('read' | 'write')[]
    network?: string[]
    shell?: 'restricted' | 'full'
  }
  compat: {
    aldercowork: string
  }
  provenance?: {
    source: string
    commit: string
    digest: string
  }
  triggers?: {
    keywords?: string[]
    file_patterns?: string[]
  }
  eval?: {
    min_pass_rate: number
  }
}

/** Result from Rust list_skill_dirs IPC */
export interface SkillDirEntry {
  /** Skill ID — relative path from skills root (e.g. "my-skill" or "monorepo/sub-skill") */
  id: string
  /** Absolute path to the skill directory */
  path: string
  /** Whether a SKILL.md exists */
  hasSkillMd: boolean
  /** Whether a skill.yaml exists */
  hasSkillYaml: boolean
}

/** Default manifest for skills lacking a skill.yaml */
export function defaultManifest(id: string): SkillManifest {
  return {
    id,
    version: '0.0.0',
    publisher: 'local',
    license: 'unknown',
    entry: 'instruction',
    permissions: {},
    compat: { aldercowork: '>=0.1.0' },
  }
}
