/**
 * Keep persisted lane metadata intact while the swimlane UI is dormant.
 * See docs/project-memory.md before changing this flag.
 */
export const SWIMLANES_ENABLED = false;

/**
 * Projects group the flow list. While this is false the flows list must render exactly as it did
 * before projects existed, which keeps "do not regress the flat list" provable rather than
 * aspirational. See docs/project-memory.md before changing this flag.
 */
export const PROJECTS_ENABLED = true;
