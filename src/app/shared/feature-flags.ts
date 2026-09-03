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

/**
 * Finalizing a flow makes it permanently read-only and is irreversible, and it is not part of the
 * current workflow, so the controls that create that state are hidden.
 *
 * Only the *controls* are gated - the Finalized toggle and the Finalized filter. The indicators
 * that explain the state stay visible (the badge on a flow row, the disabled delete, the read-only
 * editor), because rows finalized earlier still exist and hiding their explanation would make the
 * app inexplicable. See docs/project-memory.md before changing this flag.
 */
export const FLOW_FINALIZATION_ENABLED = false;
