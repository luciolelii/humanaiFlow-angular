import { orderedSchemaPropertyEntries, readUiConditionRule, resolveSchemaRef, schemaFieldLabel, type UiConditionRule } from './node-utility';
import { parseSchemaRetrieverUrl, toSchemaRetrieverDependency } from './schema-driven-fields';

export type RequiredField = {
  path: string;
  label: string;
};

export type ConditionalRequiredField = {
  path: string;
  label: string;
  retrieverBlockType: string | null;
  retrieverKey: string | null;
  retrieverUrl: string | null;
  dependsOn: Array<{ key: string; path: string; source: 'field' | 'context' }>;
  requiredWhen: UiConditionRule | null;
};

export type SchemaRequirements = {
  required: RequiredField[];
  requiredObjects: RequiredField[];
  conditional: ConditionalRequiredField[];
};

export function extractSchemaRequirements(schema: Record<string, unknown> | null): SchemaRequirements {
  if (!schema) return { required: [], requiredObjects: [], conditional: [] };

  const required: RequiredField[] = [];
  const requiredObjects: RequiredField[] = [];
  const conditional: ConditionalRequiredField[] = [];
  const seenRequired = new Set<string>();
  const seenRequiredObjects = new Set<string>();
  const seenConditional = new Set<string>();

  walkSchema(schema as Record<string, any>, schema as Record<string, any>, '', required, requiredObjects, conditional, seenRequired, seenRequiredObjects, seenConditional);

  return { required, requiredObjects, conditional };
}

function walkSchema(
  node: Record<string, any>,
  root: Record<string, any>,
  pathPrefix: string,
  required: RequiredField[],
  requiredObjects: RequiredField[],
  conditional: ConditionalRequiredField[],
  seenRequired: Set<string>,
  seenRequiredObjects: Set<string>,
  seenConditional: Set<string>,
  requireAllDescendants = false,
  inheritedRequiredWhen: UiConditionRule | null = null
) {
  const resolved = resolveSchemaRef(node, root);
  if (!resolved || typeof resolved !== 'object') return;

  const properties = orderedSchemaPropertyEntries(resolved, root);
  if (!properties.length) return;

  const requiredSet = new Set<string>(Array.isArray(resolved['required']) ? resolved['required'] : []);

  for (const { key, schema: propertyResolved } of properties) {
    const propertyPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    const hasChildren = !!propertyResolved?.['properties'] || propertyResolved?.['type'] === 'object';
    const label = schemaFieldLabel(key, propertyResolved);
    const isRequiredBySchema = requiredSet.has(key);
    const isRequiredByAncestor = requireAllDescendants && key !== 'type';
    const isRequired = isRequiredBySchema || isRequiredByAncestor;
    const requiredWhen = readUiConditionRule(propertyResolved?.['x-ui-required-when']) ?? inheritedRequiredWhen;

    if (isRequiredBySchema && hasChildren && key !== 'type' && !seenRequiredObjects.has(propertyPath)) {
      seenRequiredObjects.add(propertyPath);
      requiredObjects.push({ path: propertyPath, label });
    }

    if (isRequired && !hasChildren && key !== 'type' && !seenRequired.has(propertyPath)) {
      seenRequired.add(propertyPath);
      required.push({ path: propertyPath, label });
    }

    const retrieverRequiredUrl = propertyResolved?.['x-retriever-required-url'];
    if ((requiredWhen || typeof retrieverRequiredUrl === 'string') && key !== 'type' && !hasChildren) {
      const parsedRetriever = parseSchemaRetrieverUrl(retrieverRequiredUrl);
      const retrieverKey = parsedRetriever?.key
        ?? (typeof propertyResolved?.['x-retriever-name'] === 'string' ? String(propertyResolved['x-retriever-name']) : null);
      const retrieverBlockType = parsedRetriever?.blockType ?? null;
      const rawDepends = Array.isArray(propertyResolved?.['x-retriever-required-depends-on'])
        ? (propertyResolved['x-retriever-required-depends-on'] as unknown[])
        : [];

      const dependsOn = rawDepends
        .filter((dep): dep is string => typeof dep === 'string' && dep.length > 0)
        .map((dep) => toSchemaRetrieverDependency(dep, pathPrefix));

      const signature = `${propertyPath}|${retrieverKey ?? 'local'}|${dependsOn.map((d) => d.path).join(',')}|${JSON.stringify(requiredWhen ?? null)}`;
      if (!seenConditional.has(signature)) {
        seenConditional.add(signature);
        conditional.push({
          path: propertyPath,
          label,
          retrieverBlockType,
          retrieverKey,
          retrieverUrl: typeof retrieverRequiredUrl === 'string' ? retrieverRequiredUrl : null,
          dependsOn,
          requiredWhen
        });
      }
    }

    if (hasChildren) {
      const childHasOwnRequired = Array.isArray(propertyResolved?.['required']) && propertyResolved['required'].length > 0;
      walkSchema(
        propertyResolved as Record<string, any>,
        root,
        propertyPath,
        required,
        requiredObjects,
        conditional,
        seenRequired,
        seenRequiredObjects,
        seenConditional,
        isRequired && !childHasOwnRequired,
        requiredWhen
      );
    }
  }
}
