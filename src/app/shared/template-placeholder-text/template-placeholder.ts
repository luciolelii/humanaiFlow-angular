/**
 * Human-facing text on HumanDecisionBlock.question / HumanInteractionBlock.actionDescription
 * can contain `${{name}}` / `${{name[]}}` placeholders. The API never resolves them (no
 * block type persists or returns a "resolved" prompt - see
 * docs/human-block-placeholder-resolution-frontend-integration-2026-07-24.md), so
 * resolution happens client-side, right before display.
 */
export type TemplatePlaceholderSegment = {
  kind: 'text' | 'value';
  text: string;
  name: string;
  multiple: boolean;
  value: unknown;
};

export type TemplateContextMeta = {
  executionId?: string | null;
  executionName?: string | null;
};

/**
 * Builds the flat substitution map from the three possible value sources, keyed exactly
 * as placeholders reference them in text (global/vars prefixed, plain step inputs, not).
 */
export function buildTemplateSubstitutions(
  inputs: Record<string, unknown> | null | undefined,
  globalInputs: Record<string, unknown> | null | undefined,
  executionVariables: Record<string, unknown> | null | undefined,
  context?: TemplateContextMeta,
  projectVariables?: Record<string, unknown> | null
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(inputs ?? {})) {
    values[name] = value;
  }
  for (const [name, value] of Object.entries(globalInputs ?? {})) {
    values[`global.${name}`] = value;
  }
  for (const [name, value] of Object.entries(executionVariables ?? {})) {
    values[`vars.${name}`] = value;
  }
  // Mirrors the backend namespace: project.x, global.x, vars.x and a bare input are distinct keys,
  // so no source can shadow another.
  for (const [name, value] of Object.entries(projectVariables ?? {})) {
    values[`project.${name}`] = value;
  }
  if (context?.executionId) {
    values['context.executionId'] = context.executionId;
  }
  if (context?.executionName) {
    values['context.executionName'] = context.executionName;
  }

  return values;
}

const PLACEHOLDER_PATTERN = /\$\{\{(.*?)\}\}/g;

/**
 * Splits text into alternating text/value segments in a single pass (not sequential
 * replaces), so a resolved value that itself contains `${{...}}` (e.g. a pasted CV) is
 * never resolved a second time.
 */
export function resolveTemplateSegments(
  text: string | null | undefined,
  values: Record<string, unknown>
): TemplatePlaceholderSegment[] {
  if (!text) return [];

  const segments: TemplatePlaceholderSegment[] = [];
  const pattern = new RegExp(PLACEHOLDER_PATTERN.source, PLACEHOLDER_PATTERN.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', text: text.slice(lastIndex, match.index), name: '', multiple: false, value: undefined });
    }

    const raw = match[1].trim();
    const multiple = raw.endsWith('[]');
    const name = multiple ? raw.slice(0, -2).trim() : raw;
    segments.push({
      kind: 'value',
      text: '',
      name,
      multiple,
      value: Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined
    });

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex), name: '', multiple: false, value: undefined });
  }

  return segments;
}
