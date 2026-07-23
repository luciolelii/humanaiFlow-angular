import {
  areFlowValueKindsCompatible,
  FlowBlock,
  FlowBlockConnection,
  FlowContainer,
  FlowData,
  FlowNode,
  FlowNodeDependency,
  normalizeFlowPortValueKinds,
} from '@models/flow';
import {
  ExecutionEventLogEntry,
  getExecutionStatusGroup,
  getTaskExecutionStepNode,
  TaskExecution,
  TaskExecutionStep,
} from '@models/task-execution';

export type ExecutionOutputEntry = {
  key: string;
  nodeTitle: string;
  outputName: string;
  value: string;
  preview: string;
  isLong: boolean;
  itemLabel: string | null;
};

export type ExecutionIntermediateInputEntry = {
  key: string;
  nodeTitle: string;
  inputName: string;
  inputType: string;
  sourceLabel: string;
  value: string;
  preview: string;
  isLong: boolean;
  itemLabel: string | null;
};

export type ExecutionOutputGroup = {
  nodeTitle: string;
  outputs: ExecutionOutputEntry[];
};

export type ExecutionIntermediateInputGroup = {
  nodeTitle: string;
  inputs: ExecutionIntermediateInputEntry[];
};

export type ExecutionLogEntryView = ExecutionEventLogEntry & {
  messageText: string;
  levelText: string;
};

const OUTPUT_PREVIEW_LIMIT = 80;
const INTERMEDIATE_INPUT_PREVIEW_LIMIT = 120;

export function stepTitle(step: TaskExecutionStep | null | undefined): string {
  return getTaskExecutionStepNode(step)?.name?.trim() || step?.id || 'Step';
}

export function stepNodeId(step: TaskExecutionStep | null | undefined): string {
  return getTaskExecutionStepNode(step)?.id || step?.id || '';
}

export function stringifyOutputValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatDuration(startTime: number, endTime: number): string {
  const diffMs = Math.max(0, endTime - startTime);
  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalSeconds < 60) return `${totalSeconds} sec`;
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${totalMinutes} min ${seconds} sec` : `${totalMinutes} min`;
  }
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${totalHours} h ${minutes} min` : `${totalHours} h`;
  }
  const hours = totalHours % 24;
  return hours > 0 ? `${totalDays} gg ${hours} h` : `${totalDays} gg`;
}

export function fallbackExecutionLogMessage(entry: ExecutionEventLogEntry): string {
  const type = String(entry.type ?? '').trim();
  if (type) {
    return type.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
  }
  return 'Execution event';
}

export function logLevelClass(level: string | null | undefined): string {
  const normalized = String(level ?? '').toUpperCase();
  if (normalized === 'ERROR') return 'execution-log-level-error';
  if (normalized === 'WARN' || normalized === 'WARNING') return 'execution-log-level-warn';
  return 'execution-log-level-info';
}

export function logTypeIcon(type: string | null | undefined): string {
  const normalized = String(type ?? '').toUpperCase();
  if (normalized.includes('FAILED') || normalized.includes('ERROR')) return 'error';
  if (normalized.includes('WAITING') || normalized.includes('PAUSED')) return 'pause_circle';
  if (normalized.includes('COMPLETED') || normalized.includes('SUCCESS')) return 'check_circle';
  if (normalized.includes('HTTP')) return 'language';
  if (normalized.includes('LLM')) return 'smart_toy';
  if (normalized.includes('MCP_SESSION')) return 'hub';
  return 'schedule';
}

export function formatExecutionOutputLabel(
  key: string,
  steps: Record<string, TaskExecutionStep>
): { nodeTitle: string; outputName: string } {
  const separatorIndex = key.indexOf(':');
  if (separatorIndex < 0) {
    return { nodeTitle: 'Execution output', outputName: key };
  }
  const nodeId = key.slice(0, separatorIndex);
  const outputName = key.slice(separatorIndex + 1);
  const step = steps[nodeId];
  const nodeName = stepTitle(step).trim();
  return {
    nodeTitle: nodeName || key,
    outputName: outputName || 'Execution output',
  };
}

export function buildExecutionOutputs(execution: TaskExecution | null): ExecutionOutputEntry[] {
  if (!execution) return [];
  const steps = execution.context.steps ?? {};
  const resultMap = execution.context.result ?? {};

  return Object.entries(resultMap)
    .flatMap(([key, rawValue]) => {
      const label = formatExecutionOutputLabel(key, steps);
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      return values.map((item, index) => {
        const value = stringifyOutputValue(item);
        const isLong = value.length > OUTPUT_PREVIEW_LIMIT;
        const isArrayItem = Array.isArray(rawValue);
        return {
          key: isArrayItem ? `${key}:${index}` : key,
          nodeTitle: label.nodeTitle,
          outputName: label.outputName,
          value,
          preview: isLong ? `${value.slice(0, OUTPUT_PREVIEW_LIMIT)}...` : value,
          isLong,
          itemLabel: isArrayItem ? `Item ${index + 1}` : null,
        };
      });
    })
    .sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle) || a.outputName.localeCompare(b.outputName));
}

export function buildExecutionOutputGroups(outputs: ExecutionOutputEntry[]): ExecutionOutputGroup[] {
  const groups = new Map<string, ExecutionOutputEntry[]>();
  for (const output of outputs) {
    if (!groups.has(output.nodeTitle)) groups.set(output.nodeTitle, []);
    groups.get(output.nodeTitle)!.push(output);
  }
  return Array.from(groups.entries())
    .map(([nodeTitle, outs]) => ({ nodeTitle, outputs: outs }))
    .sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle));
}

export function buildExecutionIntermediateInputs(execution: TaskExecution | null): ExecutionIntermediateInputEntry[] {
  if (!execution) return [];
  const contextInputs = execution.context.inputs ?? {};

  return Object.values(execution.context.steps ?? {})
    .flatMap((step) => {
      const inputValues = getExecutionInputValues(step, contextInputs);
      return Object.entries(inputValues).flatMap(([inputName, rawValue]) => {
        const input = (step.inputs ?? []).find((candidate) => candidate.descriptor?.name === inputName);
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        const isArrayValue = Array.isArray(rawValue);

        return values.map((item, index) => {
          const value = stringifyOutputValue(item);
          const isLong = value.length > INTERMEDIATE_INPUT_PREVIEW_LIMIT;
          return {
            key: isArrayValue ? `${step.id}:${inputName}:${index}` : `${step.id}:${inputName}`,
            nodeTitle: stepTitle(step),
            inputName,
            inputType: String(input?.descriptor?.type ?? 'TEXT').toUpperCase(),
            sourceLabel: input?.registered ? 'Connected input' : 'Prepared input',
            value,
            preview: isLong ? `${value.slice(0, INTERMEDIATE_INPUT_PREVIEW_LIMIT)}...` : value,
            isLong,
            itemLabel: isArrayValue ? `Item ${index + 1}` : null,
          };
        });
      });
    })
    .filter((entry) => entry.value.trim().length > 0)
    .sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle) || a.inputName.localeCompare(b.inputName));
}

export function buildExecutionIntermediateInputGroups(
  inputs: ExecutionIntermediateInputEntry[]
): ExecutionIntermediateInputGroup[] {
  const groups = new Map<string, ExecutionIntermediateInputEntry[]>();
  for (const input of inputs) {
    if (!groups.has(input.nodeTitle)) groups.set(input.nodeTitle, []);
    groups.get(input.nodeTitle)!.push(input);
  }
  return Array.from(groups.entries())
    .map(([nodeTitle, items]) => ({ nodeTitle, inputs: items }))
    .sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle));
}

export function buildVisibleExecutionLogs(logs: ExecutionEventLogEntry[]): ExecutionLogEntryView[] {
  return [...logs]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) => ({
      ...entry,
      messageText: String(entry.message ?? '').trim() || fallbackExecutionLogMessage(entry),
      levelText: String(entry.level ?? 'INFO').toUpperCase(),
    }));
}

export function isInputSet(value: unknown, multiple = false): boolean {
  if (multiple) {
    if (!Array.isArray(value)) return false;
    return value.some((item) => (typeof item === 'string' ? item.trim().length > 0 : item != null));
  }
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function normalizeEditableInputValue(value: unknown, multiple: boolean): string | string[] {
  if (multiple) {
    if (Array.isArray(value)) return value.map((item) => stringifyEditableInputItem(item));
    if (value == null) return [''];
    return [stringifyEditableInputItem(value)];
  }
  if (value == null) return '';
  return stringifyEditableInputItem(value);
}

export function stringifyEditableInputItem(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function getExecutionInputValues(
  step: TaskExecutionStep,
  contextInputs: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const input of step.inputs ?? []) {
    const inputName = input.descriptor?.name;
    if (!inputName) continue;
    const key = `${step.id}:${inputName}`;
    if (Object.prototype.hasOwnProperty.call(contextInputs, key)) {
      result[inputName] = contextInputs[key];
      continue;
    }
    if (input.set || input.registered || input.value != null) {
      result[inputName] = input.value;
    }
  }
  return result;
}

export function getExecutionOutputValues(
  step: TaskExecutionStep,
  contextResults: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const output of step.outputs ?? []) {
    const outputName = output.descriptor?.name;
    if (!outputName) continue;
    const key = `${step.id}:${outputName}`;
    if (Object.prototype.hasOwnProperty.call(contextResults, key)) {
      result[outputName] = contextResults[key];
    }
  }
  return result;
}

export function getConnectedInputs(step: TaskExecutionStep): string[] {
  return (step.inputs ?? [])
    .filter((input) => input.registered)
    .map((input) => input.descriptor?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

export function getConnectedOutputs(step: TaskExecutionStep): string[] {
  return (step.outputs ?? [])
    .filter((output) => output.connected)
    .map((output) => output.descriptor?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

export function getExecutionErrors(stepId: string, contextErrors: Record<string, unknown>): string[] {
  const raw = contextErrors[stepId];
  if (typeof raw === 'string' && raw.trim().length > 0) return [raw];
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }
  return [];
}

export function getExecutionWarnings(stepId: string, contextWarnings: unknown): string[] {
  if (!contextWarnings || typeof contextWarnings !== 'object') return [];
  if (Array.isArray(contextWarnings)) {
    return contextWarnings.flatMap((warning) => {
      if (typeof warning === 'string') return [warning];
      if (!warning || typeof warning !== 'object') return [];
      const value = warning as Record<string, unknown>;
      const warningStepId = value['stepId'] ?? value['nodeId'];
      const message = value['message'] ?? value['warning'];
      return String(warningStepId ?? '') === stepId && typeof message === 'string' && message.trim()
        ? [message]
        : [];
    });
  }
  const raw = (contextWarnings as Record<string, unknown>)[stepId];
  if (typeof raw === 'string' && raw.trim().length > 0) return [raw];
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }
  return [];
}
