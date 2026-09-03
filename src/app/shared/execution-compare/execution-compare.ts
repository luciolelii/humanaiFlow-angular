import { TaskExecution, TaskExecutionOutcome, TaskExecutionStep } from '@models/task-execution';
import {
  getExecutionInputValues,
  resolveStepOutputs,
  stepTitle,
  stringifyOutputValue
} from '@shared/task-execution-viewer/execution-viewer.utils';

/** Whether a value is the same on both sides, or present on only one of them. */
export type ComparisonState = 'equal' | 'changed' | 'only-left' | 'only-right';

export type ComparedValue = {
  /** `inputs` or `outputs` plus the port name, e.g. `outputs.response`. */
  key: string;
  kind: 'input' | 'output';
  name: string;
  left: string | null;
  right: string | null;
  state: ComparisonState;
};

export type ComparedNode = {
  stepId: string;
  title: string;
  leftStatus: string | null;
  rightStatus: string | null;
  statusChanged: boolean;
  values: ComparedValue[];
  /** True when anything about this node differs, including its status. */
  changed: boolean;
  state: ComparisonState;
};

export type ComparedOutcome = {
  code: string;
  label: string | null;
  left: string | null;
  right: string | null;
  state: ComparisonState;
};

export type ExecutionComparison = {
  nodes: ComparedNode[];
  outcomes: ComparedOutcome[];
  changedNodeCount: number;
  /**
   * The two runs do not share a node in common. Almost always the flow was edited between them,
   * in which case a per-node comparison is meaningless rather than merely empty.
   */
  disjoint: boolean;
};

function normalize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = stringifyOutputValue(value);
  return text.trim().length ? text : null;
}

function stateOf(left: string | null, right: string | null): ComparisonState {
  if (left !== null && right === null) return 'only-left';
  if (left === null && right !== null) return 'only-right';
  return left === right ? 'equal' : 'changed';
}

function valuesOf(step: TaskExecutionStep | undefined, execution: TaskExecution | undefined) {
  if (!step || !execution) return { inputs: {}, outputs: {} };
  return {
    inputs: getExecutionInputValues(step, execution.context.inputs ?? {}),
    outputs: resolveStepOutputs(step, execution)
  };
}

function compareOutcomes(left: TaskExecution, right: TaskExecution): ComparedOutcome[] {
  const byCode = (execution: TaskExecution) => new Map<string, TaskExecutionOutcome>(
    (execution.context.outcomes ?? []).map((outcome) => [outcome.code, outcome])
  );
  const leftOutcomes = byCode(left);
  const rightOutcomes = byCode(right);

  return [...new Set([...leftOutcomes.keys(), ...rightOutcomes.keys()])].sort().map((code) => {
    const leftValue = normalize(leftOutcomes.get(code)?.payload);
    const rightValue = normalize(rightOutcomes.get(code)?.payload);
    // An outcome reached by only one run is a difference in itself, even with no payload.
    const reachedOnLeft = leftOutcomes.has(code);
    const reachedOnRight = rightOutcomes.has(code);
    const state: ComparisonState = reachedOnLeft && !reachedOnRight
      ? 'only-left'
      : !reachedOnLeft && reachedOnRight
        ? 'only-right'
        : stateOf(leftValue, rightValue);
    return {
      code,
      label: leftOutcomes.get(code)?.label ?? rightOutcomes.get(code)?.label ?? null,
      left: leftValue,
      right: rightValue,
      state
    };
  });
}

/**
 * Joins two runs of the same flow node by node.
 *
 * The join key is the step id, which is stable across runs of one flow. It is deliberately not
 * done by node name: names are not unique and can be edited, and a rename would silently report
 * every node as replaced.
 *
 * This is not the bias comparison. That one scopes itself to the nodes a probe was activated on
 * and refuses a run that is not an experiment, so for two ordinary runs it compares nothing.
 */
export function compareExecutions(left: TaskExecution, right: TaskExecution): ExecutionComparison {
  const leftSteps = left.context.steps ?? {};
  const rightSteps = right.context.steps ?? {};
  const stepIds = [...new Set([...Object.keys(leftSteps), ...Object.keys(rightSteps)])];

  const nodes = stepIds.map<ComparedNode>((stepId) => {
    const leftStep = leftSteps[stepId];
    const rightStep = rightSteps[stepId];
    const leftValues = valuesOf(leftStep, left);
    const rightValues = valuesOf(rightStep, right);

    const values: ComparedValue[] = [];
    for (const kind of ['input', 'output'] as const) {
      const leftSide = kind === 'input' ? leftValues.inputs : leftValues.outputs;
      const rightSide = kind === 'input' ? rightValues.inputs : rightValues.outputs;
      const names = [...new Set([...Object.keys(leftSide), ...Object.keys(rightSide)])].sort();
      for (const name of names) {
        const leftValue = normalize(leftSide[name]);
        const rightValue = normalize(rightSide[name]);
        if (leftValue === null && rightValue === null) continue;
        values.push({
          key: `${kind}s.${name}`,
          kind,
          name,
          left: leftValue,
          right: rightValue,
          state: stateOf(leftValue, rightValue)
        });
      }
    }

    const leftStatus = leftStep ? String(leftStep.status ?? '') : null;
    const rightStatus = rightStep ? String(rightStep.status ?? '') : null;
    const statusChanged = !!leftStep && !!rightStep && leftStatus !== rightStatus;
    const state: ComparisonState = leftStep && !rightStep
      ? 'only-left'
      : !leftStep && rightStep
        ? 'only-right'
        : values.some((value) => value.state !== 'equal') || statusChanged
          ? 'changed'
          : 'equal';

    return {
      stepId,
      title: stepTitle(leftStep ?? rightStep),
      leftStatus,
      rightStatus,
      statusChanged,
      values,
      changed: state !== 'equal',
      state
    };
  });

  // Changed nodes first: on a long flow the differences are what the view exists to show.
  nodes.sort((a, b) => Number(b.changed) - Number(a.changed) || a.title.localeCompare(b.title));

  const sharedStepIds = stepIds.filter((stepId) => leftSteps[stepId] && rightSteps[stepId]);
  return {
    nodes,
    outcomes: compareOutcomes(left, right),
    changedNodeCount: nodes.filter((node) => node.changed).length,
    disjoint: stepIds.length > 0 && sharedStepIds.length === 0
  };
}
