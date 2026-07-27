import { FlowContainer, FlowData } from '@models/flow';

export type FlowSubflowLocatorStep = {
  containerId: string;
  configurationPath: string;
};

export type FlowSubflowEntry = {
  key: string;
  label: string;
  containerName: string;
  fieldLabel: string;
  depth: number;
  locator: FlowSubflowLocatorStep[];
};

export function listFlowSubflows(flowData: FlowData): FlowSubflowEntry[] {
  const entries: FlowSubflowEntry[] = [];
  const visited = new WeakSet<object>();

  const visit = (data: FlowData, parentLocator: FlowSubflowLocatorStep[]) => {
    if (visited.has(data)) return;
    visited.add(data);

    for (const container of data.containers ?? []) {
      for (const candidate of flowDataValues(container.specificConfiguration)) {
        const locator = [
          ...parentLocator,
          { containerId: container.id, configurationPath: candidate.path }
        ];
        const fieldLabel = pathLabel(candidate.path);
        entries.push({
          key: subflowLocatorKey(locator),
          label: `${container.name || container.typeName} · ${fieldLabel}`,
          containerName: container.name || container.typeName,
          fieldLabel,
          depth: parentLocator.length + 1,
          locator
        });
        visit(candidate.data, locator);
      }
    }
  };

  visit(flowData, []);
  return entries;
}

export function resolveFlowSubflow(
  rootData: FlowData,
  locator: FlowSubflowLocatorStep[]
): FlowData | null {
  let current: FlowData = rootData;

  for (const step of locator) {
    const container = (current.containers ?? []).find((item) => item.id === step.containerId);
    if (!container) return null;
    const value = valueAtPath(container.specificConfiguration, step.configurationPath);
    if (!isFlowData(value)) return null;
    current = value;
  }

  return current;
}

export function replaceFlowSubflow(
  rootData: FlowData,
  locator: FlowSubflowLocatorStep[],
  replacement: FlowData
): FlowData | null {
  if (!locator.length) return replacement;

  const clonedRoot = cloneFlowData(rootData);
  let current = clonedRoot;

  for (let index = 0; index < locator.length; index++) {
    const step = locator[index];
    const container = (current.containers ?? []).find((item) => item.id === step.containerId);
    if (!container) return null;

    if (index === locator.length - 1) {
      if (!setValueAtPath(container, step.configurationPath, replacement)) return null;
      return clonedRoot;
    }

    const nested = valueAtPath(container.specificConfiguration, step.configurationPath);
    if (!isFlowData(nested)) return null;
    current = nested;
  }

  return null;
}

export function subflowLocatorKey(locator: FlowSubflowLocatorStep[]): string {
  return locator
    .map((step) => `${encodeURIComponent(step.containerId)}:${encodeURIComponent(step.configurationPath)}`)
    .join('/');
}

function flowDataValues(configuration: unknown): Array<{ path: string; data: FlowData }> {
  const results: Array<{ path: string; data: FlowData }> = [];

  const walk = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (isFlowData(value)) {
      results.push({ path, data: value });
      return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, path ? `${path}.${key}` : key);
    }
  };

  walk(configuration, '');
  return results.filter((result) => result.path.length > 0);
}

function isFlowData(value: unknown): value is FlowData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const hasFlowShape = ['blocks', 'containers', 'connections'].every((key) =>
    Object.prototype.hasOwnProperty.call(candidate, key)
  );
  if (!hasFlowShape) return false;

  return isNullableArray(candidate['blocks'])
    && isNullableArray(candidate['containers'])
    && isNullableArray(candidate['connections'])
    && isNullableArray(candidate['dependencies'])
    && isNullableArray(candidate['globalInputs'])
    && isNullableArray(candidate['lanes']);
}

function isNullableArray(value: unknown): boolean {
  return value == null || Array.isArray(value);
}

function valueAtPath(root: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, root);
}

function setValueAtPath(container: FlowContainer, path: string, value: FlowData): boolean {
  const segments = path.split('.').filter(Boolean);
  if (!segments.length) return false;

  let target: Record<string, unknown> = container.specificConfiguration as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const child = target[segment];
    if (!child || typeof child !== 'object' || Array.isArray(child)) return false;
    target = child as Record<string, unknown>;
  }
  target[segments[segments.length - 1]] = cloneFlowData(value);
  return true;
}

function pathLabel(path: string): string {
  const lastSegment = path.split('.').at(-1) ?? 'subflow';
  return lastSegment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function cloneFlowData(data: FlowData): FlowData {
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data)) as FlowData;
}
