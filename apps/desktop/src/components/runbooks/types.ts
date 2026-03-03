/**
 * Runbook data model.
 *
 * A Runbook is a structured note — essentially a large prompt with
 * @skill references and todo markers (`- [ ]` / `- [x]`).
 * The entire content is sent as a single prompt to the AI engine.
 */

export interface Runbook {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /**
   * Markdown content with special semantics:
   * - `@skill-name` inline references to installed skills
   * - `- [ ]` / `- [x]` todo markers (interactive checkboxes in UI)
   */
  content: string
  /** ISO 8601 */
  createdAt: string
  /** ISO 8601 */
  updatedAt: string
}
