import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
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

  readonly stepsArray = computed(() =>
    Object.values(this.execution()?.context.steps ?? {})
  );

  readonly executionFlowData = computed<FlowData>(() => {
    const contextInputs = this.execution()?.context.inputs ?? {};
    const contextErrors = this.execution()?.context.errors ?? {};
    const contextWarnings = this.execution()?.context.warnings ?? {};
    const steps = this.stepsArray();
    const blocks = steps.map((step, index) => ({
      ...step.block,
      specificConfiguration: {
        ...(step.block.specificConfiguration ?? {}),
        __executionInputs: this.getExecutionInputValues(step, contextInputs),
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
