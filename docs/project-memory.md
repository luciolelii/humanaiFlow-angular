# Project memory

## Swimlanes temporarily disabled — 2026-07-22

The swimlane feature is intentionally disabled because its current visual and
interaction model is not sufficiently understandable.

- Do not render swimlane bands, headers, node badges, or management controls.
- Do not assign or change a node's `laneId` while the feature is disabled.
- Preserve the existing `lanes` and `laneId` data and keep the implementation in
  the codebase for a future redesign.
- The feature is controlled by `SWIMLANES_ENABLED` in
  `src/app/shared/feature-flags.ts`.
- Before re-enabling it, redesign and validate how users create lanes, understand
  their boundaries, and assign or move nodes between them.

To restore the current implementation for development, set
`SWIMLANES_ENABLED` to `true`.

## Projects — 2026-09-02

Projects group the flow list: one project holds 1..N flows, and a flow's
`projectId` is optional, so flows without a project stay fully valid.

- The feature is controlled by `PROJECTS_ENABLED` in
  `src/app/shared/feature-flags.ts`. With it off, `flows-list` must render
  exactly as it did before projects existed — that is what keeps "do not regress
  the flat list" provable, and `flows-list.spec.ts` guards it.
- **A flow's project is never sent in the flow update body.**
  `toFlowCreateRequest` builds the full-replace `PUT /flows/{id}` the editor
  issues on every save, so a project carried there would be silently dropped on
  each save. Membership changes only through `assignFlowToProject`
  (`PUT /flows/{id}/project`). `flow-mapper.spec.ts` guards this.
- Deleting a project **also deletes every flow in it, finalized ones included**.
  That is deliberate: finalizing is irreversible, so refusing the cascade would
  make such a project permanently undeletable. The confirmation dialog
  (`shared/project-delete-dialog`) requires the project name to be typed.
- Grouping semantics live in the pure `shared/flows-list/flow-grouping.ts`, not
  in the component: `flows-list` keeps owning the load, filter, sort and list
  state, and only feeds the grouped result to a presentational component.
- Projects must never be able to break flows: the projects load runs alongside
  the flows load, never gates it, and a failure falls back to the flat list.

### Project shared context and project runs — 2026-09-02

- A flow inherits its project's values at run time, readable in prompts as
  `${{project.x}}` and in conditional/switch expressions as `#project['x']`. The
  namespace mirrors the backend, so `project.x`, `global.x`, `vars.x` and a bare
  input never shadow each other.
- The values are **frozen when the execution is created**. Editing the project
  afterwards does not change a run that already exists.
- The context is applied **only when the person running owns the project**: a
  published flow can be run by anyone, and the values may be private.
- Editing lives in `shared/project-context-dialog`, opened from the project's
  menu in the flows list. The title toolbar's Global Inputs panel shows the
  inherited values **read-only**, because that is where prompts are written.
- "Run project" creates one execution per executable flow, sharing a
  `projectRunId`, and **does not start them** — each still needs its inputs and
  credentials, exactly like a single-flow run. The UI passes
  `skipNonExecutable: true` so one draft flow cannot block the whole run.
- Project runs surface in `/tasks` as N sibling groups (execution groups have a
  single level, keyed by source flow). `tasks-executor` derives a `projectName`
  onto each group and `tasks-executions-list` renders it as a chip, searchable
  and sortable — no second nesting level, no backend change.

### Sequential project runs — 2026-09-03

- "Run project" now **creates and starts** a run: the flows execute one at a time
  in the project's order, each step starting only when the previous succeeded.
  Creating without starting would look like nothing happened.
- A run can come back `BLOCKED` (the next flow still needs inputs or credentials)
  or `STOPPED` (a flow failed). The UI says so instead of claiming it is running,
  and still navigates to /tasks so the user can supply what is missing. Calling
  start again resumes from where it stopped.
- Flow order inside a project is set with the up/down arrows in the group, which
  persist `project_order` — deliberately not drag-and-drop, for the same reasons
  as flow assignment: a 320px scrolling sidebar where the card is already a click
  target.
