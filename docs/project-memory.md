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
