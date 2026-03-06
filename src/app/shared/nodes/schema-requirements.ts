import { resolveSchemaRef } from './node-utility';

export type RequiredField = {
  path: string;
  label: string;
};

export type ConditionalRequiredField = {
  path: string;
  label: string;
  retrieverBlockType: string | null;
  retrieverKey: string;
  dependsOn: Array<{ key: string; path: string }>;
};

export type SchemaRequirements = {
  required: RequiredField[];
  conditional: ConditionalRequiredField[];
};

export function extractSchemaRequirements(schema: Record<string, unknown> | null): SchemaRequirements {
  if (!schema) return { required: [], conditional: [] };

  const required: RequiredField[] = [];
  const conditional: ConditionalRequiredField[] = [];
  const seenRequired = new Set<string>();
  const seenConditional = new Set<string>();

  walkSchema(schema as Record<string, any>, schema as Record<string, any>, '', required, conditional, seenRequired, seenConditional);

  return { required, conditional };
}

function walkSchema(
  node: Record<string, any>,
  root: Record<string, any>,
  pathPrefix: string,
  required: RequiredField[],
  conditional: ConditionalRequiredField[],
  seenRequired: Set<string>,
  seenConditional: Set<string>
) {
  const resolved = resolveSchemaRef(node, root);
  if (!resolved || typeof resolved !== 'object') return;

  const properties = resolved.properties as Record<string, any> | undefined;
  if (!properties) return;

  const requiredSet = new Set<string>(Array.isArray(resolved.required) ? resolved.required : []);

  for (const [key, propertySchema] of Object.entries(properties)) {
    const propertyPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    const propertyResolved = resolveSchemaRef(propertySchema as Record<string, any>, root);
    const hasChildren = !!propertyResolved?.properties || propertyResolved?.type === 'object';
    const label = toLabel(key);

    if (requiredSet.has(key) && !hasChildren && key !== 'type' && !seenRequired.has(propertyPath)) {
      seenRequired.add(propertyPath);
      required.push({ path: propertyPath, label });
    }

    const retrieverRequiredUrl = propertyResolved?.['x-retriever-required-url'];
    if (typeof retrieverRequiredUrl === 'string') {
      const parsedRetriever = parseRetrieverUrl(retrieverRequiredUrl);
      const retrieverKey = parsedRetriever?.key ?? String(propertyResolved?.['x-retriever-name'] ?? key);
      const retrieverBlockType = parsedRetriever?.blockType ?? null;
      const rawDepends = Array.isArray(propertyResolved?.['x-retriever-required-depends-on'])
        ? (propertyResolved['x-retriever-required-depends-on'] as unknown[])
        : [];

      const dependsOn = rawDepends
        .filter((dep): dep is string => typeof dep === 'string' && dep.length > 0)
        .map((dep) => ({
          key: dep,
          path: pathPrefix ? `${pathPrefix}.${dep}` : dep
        }));

      const signature = `${propertyPath}|${retrieverKey}|${dependsOn.map((d) => d.path).join(',')}`;
      if (!seenConditional.has(signature)) {
        seenConditional.add(signature);
        conditional.push({
          path: propertyPath,
          label,
          retrieverBlockType,
          retrieverKey,
          dependsOn
        });
      }
    }

    if (hasChildren) {
      walkSchema(propertyResolved as Record<string, any>, root, propertyPath, required, conditional, seenRequired, seenConditional);
    }
  }
}

function toLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function parseRetrieverUrl(rawUrl: unknown): { blockType: string; key: string } | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return null;

  const path = rawUrl.split('?')[0];
  const normalized = path.endsWith('/required') ? path.slice(0, -'/required'.length) : path;
  const parts = normalized.split('/').filter(Boolean);
  const retrieverIndex = parts.findIndex((part) => part === 'retriever');
  if (retrieverIndex < 0 || parts.length < retrieverIndex + 3) return null;

  const blockType = parts[retrieverIndex + 1];
  const key = parts[retrieverIndex + 2];
  if (!blockType || !key) return null;

  return { blockType, key };
}
