import { CommonModule } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { FlowData } from '@models/flow';
import { TaskExecution, TaskExecutionStep } from '@models/task-execution';
import { ReteEditor } from '@shared/rete-editor/rete-editor';

@Component({
  selector: 'app-task-execution-viewer',
  imports: [CommonModule, ReteEditor],
  templateUrl: './task-execution-viewer.html',
  styleUrl: './task-execution-viewer.css',
})
export class TaskExecutionViewerComponent {
  readonly execution = input<TaskExecution | null>(null);
  readonly contextAsideOpen = signal(true);

  readonly stepsArray = computed(() =>
    Object.values(this.execution()?.context.steps ?? {})
  );

  readonly executionFlowData = computed<FlowData>(() => {
    const contextInputs = this.execution()?.context.inputs ?? {};
    const contextResults = {
      ...(this.execution()?.context.result ?? {}),
      ...(this.execution()?.context.executionResult ?? {})
    };
    const contextErrors = this.execution()?.context.errors ?? {};
    const contextWarnings = this.execution()?.context.warnings ?? {};
    const waitingSteps = this.execution()?.context.waitingSteps ?? [];
    const steps = this.stepsArray();
    const blocks = steps.map((step, index) => ({
      ...step.block,
      specificConfiguration: {
        ...(step.block.specificConfiguration ?? {}),
        __stepStatus: step.status,
        __isWaitingStep: waitingSteps.includes(step.id),
        __executionInputs: this.getExecutionInputValues(step, contextInputs),
        __connectedInputs: this.getConnectedInputs(step),
        __executionOutputs: this.getExecutionOutputValues(step, contextResults),
        __connectedOutputs: this.getConnectedOutputs(step),
        __executionErrors: this.getExecutionErrors(step.id, contextErrors),
        __executionWarnings: this.getExecutionWarnings(step.id, contextWarnings)
      },
      position: step.block.position ?? {
        x: 120 + (index % 3) * 340,
        y: 100 + Math.floor(index / 3) * 220
      }
    }));

    const connections = this.inferConnections(steps);
    return { blocks, connections };
  });

  readonly durationMs = computed(() => {
    const context = this.execution()?.context;
    if (!context?.startTime || !context?.endTime) return null;
    return Math.max(0, context.endTime - context.startTime);
  });

  toggleContextAside() {
    this.contextAsideOpen.update((open) => !open);
  }

  private inferConnections(steps: TaskExecutionStep[]) {
    const connections: FlowData['connections'] = [];

    for (const targetStep of steps) {
      for (const input of targetStep.inputs ?? []) {
        if (!input.registered) continue;

        const candidates = steps
          .filter((step) => step.id !== targetStep.id)
          .flatMap((sourceStep) =>
            (sourceStep.outputs ?? [])
              .filter((output) => output.connected && output.descriptor.type === input.descriptor.type)
              .map((output) => ({
                sourceStep,
                sourceOutputName: output.descriptor.name
              }))
          );

        if (candidates.length !== 1) continue;

        const source = candidates[0];
        const id = `${source.sourceStep.id}_${source.sourceOutputName}_${targetStep.id}_${input.descriptor.name}`;
        if (connections.some((connection) => connection.id === id)) continue;

        connections.push({
          id,
          sourceId: source.sourceStep.block.id,
          sourceName: source.sourceOutputName,
          targetId: targetStep.block.id,
          targetName: input.descriptor.name
        });
      }
    }

    return connections;
  }

  private getExecutionInputValues(
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

  private getConnectedInputs(step: TaskExecutionStep): string[] {
    return (step.inputs ?? [])
      .filter((input) => input.registered)
      .map((input) => input.descriptor?.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
  }

  private getExecutionOutputValues(
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

  private getConnectedOutputs(step: TaskExecutionStep): string[] {
    return (step.outputs ?? [])
      .filter((output) => output.connected)
      .map((output) => output.descriptor?.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
  }

  private getExecutionErrors(
    stepId: string,
    contextErrors: Record<string, unknown>
  ): string[] {
    const raw = contextErrors[stepId];
    if (typeof raw === 'string' && raw.trim().length > 0) return [raw];
    if (Array.isArray(raw)) {
      return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    }
    return [];
  }

  private getExecutionWarnings(
    stepId: string,
    contextWarnings: Record<string, string>
  ): string[] {
    const raw = contextWarnings[stepId];
    return raw && raw.trim().length > 0 ? [raw] : [];
  }
}
