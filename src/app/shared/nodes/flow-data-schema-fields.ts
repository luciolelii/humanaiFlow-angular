import { FlowBlock, FlowContainer, FlowData, FlowGlobalInput } from '@models/flow';
import { orderedSchemaPropertyEntries, parentPath, resolveSchemaRef, schemaFieldLabel } from './node-utility';
import { schemaRetrieverMeta, toSchemaFieldUiMeta, type SchemaFieldUiMeta, type SchemaRetrieverDependency } from './schema-driven-fields';

export type SchemaFlowDataFieldDefinition = {
  path: string;
  label: string;
  retrieverBlockType: string | null;
  retrieverKey: string | null;
  retrieverUrl: string | null;
  retrieverStructuredData: boolean;
  retrieverDependsOn: SchemaRetrieverDependency[];
  validationUrl: string | null;
  validationType: string | null;
  requiresAuth: boolean;
  ui: SchemaFieldUiMeta;
};

export function collectSchemaFlowDataFields(root: Record<string, any> | null | undefined): SchemaFlowDataFieldDefinition[] {
  if (!root) return [];

  const fields: SchemaFlowDataFieldDefinition[] = [];
  const seen = new Set<string>();

  const walk = (node: Record<string, any>, pathPrefix: string) => {
    const resolved = resolveSchemaRef(node, root);
    if (!resolved || typeof resolved !== 'object') return;

    for (const { key, schema } of orderedSchemaPropertyEntries(resolved, root)) {
      if (!schema) continue;

      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      const fieldSchema = resolveSchemaRef(schema, root);
      if (!fieldSchema || typeof fieldSchema !== 'object') continue;

      if (isFlowDataSchema(fieldSchema, root)) {
        if (!seen.has(path)) {
          seen.add(path);
          const retriever = schemaRetrieverMeta(fieldSchema, parentPath(path) ?? '');
          fields.push({
            path,
            label: schemaFieldLabel(path, fieldSchema),
            ...retriever,
            validationUrl: resolveSubflowValidationUrl(fieldSchema),
            validationType: toNonEmptyString(fieldSchema['x-subflow-validation-type']),
            requiresAuth: fieldSchema['x-retriever-requires-auth'] === true,
            ui: toSchemaFieldUiMeta(fieldSchema)
          });
        }
        continue;
      }

      const hasChildren = !!fieldSchema['properties'] || fieldSchema['type'] === 'object';
      if (hasChildren) {
        walk(fieldSchema, path);
      }
    }
  };

  walk(root, '');
  return fields;
}

function resolveSubflowValidationUrl(schema: Record<string, any>): string | null {
  const validationUrl = toNonEmptyString(schema['x-retriever-validation-url']);
  const validationType = toNonEmptyString(schema['x-subflow-validation-type']);
  if (!validationUrl) {
    return validationType
      ? `/containers/validate-subflow?type=${encodeURIComponent(validationType)}`
      : null;
  }

  if (!validationType || hasQueryParam(validationUrl, 'type')) return validationUrl;

  return `${validationUrl}${validationUrl.includes('?') ? '&' : '?'}type=${encodeURIComponent(validationType)}`;
}

function hasQueryParam(rawUrl: string, key: string): boolean {
  const queryString = rawUrl.split('?', 2)[1];
  if (!queryString) return false;
  return new URLSearchParams(queryString).has(key);
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function isFlowDataFieldPath(path: string, fields: Array<{ path: string }>): boolean {
  return fields.some((field) => path === field.path || path.startsWith(`${field.path}.`));
}

export function normalizeFlowDataValue(raw: unknown): FlowData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const candidate = raw as Record<string, unknown>;
  const blocks = normalizeSubFlowBlocks(candidate['blocks']);
  const containers = normalizeSubFlowContainers(candidate['containers']);
  const connections = Array.isArray(candidate['connections'])
    ? candidate['connections'].filter((item): item is FlowData['connections'][number] => !!item && typeof item === 'object')
    : [];
  const dependencies = Array.isArray(candidate['dependencies'])
    ? candidate['dependencies'].filter((item): item is FlowData['dependencies'][number] => !!item && typeof item === 'object')
    : [];
  const globalInputs = Array.isArray(candidate['globalInputs'])
    ? candidate['globalInputs'].filter((item): item is FlowGlobalInput => !!item && typeof item === 'object')
    : undefined;

  if (!blocks.length && !containers.length && !connections.length && !dependencies.length) {
    return null;
  }

  return {
    blocks,
    containers,
    connections,
    dependencies,
    ...(globalInputs ? { globalInputs } : {})
  };
}

export function flowDataNodeCount(flowData: FlowData | null): number {
  return (flowData?.blocks?.length ?? 0) + (flowData?.containers?.length ?? 0);
}

function isFlowDataSchema(schema: Record<string, any>, root: Record<string, any>): boolean {
  const ref = schema['$ref'];
  if (typeof ref === 'string' && ref.split('/').at(-1) === 'FlowData') return true;

  const resolved = resolveSchemaRef(schema, root);
  const properties = resolved?.['properties'];
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return false;

  return ['blocks', 'containers', 'connections'].every((key) =>
    Object.prototype.hasOwnProperty.call(properties, key)
  );
}

function normalizeSubFlowBlocks(raw: unknown): FlowBlock[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      ...item,
      position: normalizePosition(item['position']),
      nodeFamily: 'block'
    })) as FlowBlock[];
}

function normalizeSubFlowContainers(raw: unknown): FlowContainer[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      ...item,
      position: normalizePosition(item['position']),
      nodeFamily: 'container'
    })) as FlowContainer[];
}

function normalizePosition(raw: unknown): { x: number; y: number } | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const x = typeof value['x'] === 'number' ? value['x'] : Number(value['x']);
  const y = typeof value['y'] === 'number' ? value['y'] : Number(value['y']);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
}
