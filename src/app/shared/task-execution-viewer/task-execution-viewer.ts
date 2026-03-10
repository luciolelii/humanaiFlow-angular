import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, OnDestroy, signal } from '@angular/core';
import { FlowBlockConnection, FlowData } from '@models/flow';
import { getExecutionStatusGroup, TaskExecution, TaskExecutionStep } from '@models/task-execution';
import {
  EditableExecutionInput,
  TaskExecutionInputsPanelComponent
} from '@shared/task-execution-inputs-panel/task-execution-inputs-panel';
import { ReteEditor } from '@shared/rete-editor/rete-editor';
import { TaskExecutionsService } from '@services/task-executions/task-executions';

@Component({
  selector: 'app-task-execution-viewer',
  imports: [CommonModule, ReteEditor, TaskExecutionInputsPanelComponent],
  templateUrl: './task-execution-viewer.html',
  styleUrl: './task-execution-viewer.css',
})
export class TaskExecutionViewerComponent implements OnDestroy {
  private static readonly TEXT_INPUT_DEBOUNCE_MS = 1200;
  private taskExecutionsService = inject(TaskExecutionsService);
  private readonly textInputDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly execution = input<TaskExecution | null>(null);
  readonly contextAsideOpen = signal(true);
  readonly startInProgress = signal(false);
  readonly savingInputs = signal<Record<string, boolean>>({});
  readonly savingErrors = signal<Record<string, string>>({});
  readonly pendingTextInputs = signal<Record<string, string>>({});

  readonly stepsArray = computed(() =>
    Object.values(this.execution()?.context.steps ?? {})
  );

  readonly executionFlowData = computed<FlowData>(() => {
    const executionStatusGroup = getExecutionStatusGroup(this.execution()?.context.status);
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
        __executionStatusGroup: executionStatusGroup,
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

    const connections = this.getExecutionConnections(steps);
    return { blocks, connections };
  });

  readonly formattedDuration = computed(() => {
    const context = this.execution()?.context;
    if (!context?.startTime || !context?.endTime) return '-';
    return this.formatDuration(context.startTime, context.endTime);
  });

  readonly inputsReadOnly = computed(() => {
    const status = this.execution()?.context.status;
    return getExecutionStatusGroup(status) !== 'INIT';
  });

  readonly canStartExecution = computed(() => {
    const execution = this.execution();
    if (!execution) return false;

    const statusGroup = getExecutionStatusGroup(execution.context.status);
    if (statusGroup !== 'INIT') return false;

    const status = String(execution.context.status ?? '').toUpperCase();
    if (status !== 'CREATED' && status !== 'READY') return false;

    for (const step of Object.values(execution.context.steps ?? {})) {
      for (const input of step.inputs ?? []) {
        if (input.registered) continue;

        const inputName = input.descriptor?.name;
        if (!inputName) continue;

        const key = `${step.id}:${inputName}`;
        const value = Object.prototype.hasOwnProperty.call(execution.context.inputs ?? {}, key)
          ? execution.context.inputs[key]
          : input.value;

        if (!this.isInputSet(value)) return false;
      }
    }

    return true;
  });

  readonly editableInputs = computed<EditableExecutionInput[]>(() => {
    const execution = this.execution();
    if (!execution) return [];

    const entries: EditableExecutionInput[] = [];
    const contextInputs = execution.context.inputs ?? {};

    for (const step of Object.values(execution.context.steps ?? {})) {
      for (const input of step.inputs ?? []) {
        if (input.registered) continue;

        const inputName = input.descriptor?.name;
        if (!inputName) continue;

        const key = `${step.id}:${inputName}`;
        const rawValue = Object.prototype.hasOwnProperty.call(contextInputs, key)
          ? contextInputs[key]
          : input.value;
        const pendingValue = this.pendingTextInputs()[key];

        entries.push({
          key,
          nodeId: step.id,
          inputName,
          label: `${step.block.name}.${inputName}`,
          type: String(input.descriptor?.type ?? 'TEXT').toUpperCase(),
          value: pendingValue ?? (rawValue == null ? '' : String(rawValue))
        });
      }
    }

    return entries.sort((a, b) => a.label.localeCompare(b.label));
  });

  toggleContextAside() {
    this.contextAsideOpen.update((open) => !open);
  }

  startExecution() {
    const executionId = this.execution()?.id;
    if (!executionId || !this.canStartExecution() || this.startInProgress()) return;

    this.startInProgress.set(true);
    this.taskExecutionsService.startExecution(executionId).subscribe({
      next: () => this.startInProgress.set(false),
      error: () => this.startInProgress.set(false)
    });
  }

  onTextInputChange(input: EditableExecutionInput, value: string) {
    if (this.inputsReadOnly()) return;
    const executionId = this.execution()?.id;
    if (!executionId) return;

    this.pendingTextInputs.update((current) => ({ ...current, [input.key]: value }));

    const timerKey = `${executionId}:${input.key}`;
    this.clearDebounceTimer(timerKey);
    const timer = setTimeout(() => {
      this.textInputDebounceTimers.delete(timerKey);
      this.sendPreparedTextInput(input, executionId);
    }, TaskExecutionViewerComponent.TEXT_INPUT_DEBOUNCE_MS);
    this.textInputDebounceTimers.set(timerKey, timer);
  }

  onFileInputChange(input: EditableExecutionInput, file: File) {
    if (this.inputsReadOnly()) return;
    const executionId = this.execution()?.id;
    if (!executionId) return;

    this.setInputSaving(input.key, true);
    this.taskExecutionsService.prepareFileInput(executionId, input.nodeId, input.inputName, file).subscribe({
      next: () => this.clearInputSaving(input.key),
      error: () => this.setInputError(input.key, 'Failed to upload file')
    });
  }

  private setInputSaving(key: string, saving: boolean) {
    this.savingInputs.update((current) => ({ ...current, [key]: saving }));
    if (saving) {
      this.savingErrors.update((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  private clearInputSaving(key: string) {
    this.savingInputs.update((current) => ({ ...current, [key]: false }));
    this.savingErrors.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  private setInputError(key: string, message: string) {
    this.savingInputs.update((current) => ({ ...current, [key]: false }));
    this.savingErrors.update((current) => ({ ...current, [key]: message }));
  }

  ngOnDestroy() {
    for (const timer of this.textInputDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.textInputDebounceTimers.clear();
  }

  private sendPreparedTextInput(input: EditableExecutionInput, executionId: string) {
    if (this.inputsReadOnly() || this.execution()?.id !== executionId) return;

    const value = this.pendingTextInputs()[input.key] ?? '';
    this.setInputSaving(input.key, true);
    this.taskExecutionsService.prepareStringInput(executionId, input.nodeId, input.inputName, value).subscribe({
      next: () => {
        this.pendingTextInputs.update((current) => {
          const next = { ...current };
          delete next[input.key];
          return next;
        });
        this.clearInputSaving(input.key);
      },
      error: () => this.setInputError(input.key, 'Failed to update input')
    });
  }

  private clearDebounceTimer(timerKey: string) {
    const timer = this.textInputDebounceTimers.get(timerKey);
    if (!timer) return;
    clearTimeout(timer);
    this.textInputDebounceTimers.delete(timerKey);
  }

  private formatDuration(startTime: number, endTime: number): string {
    const diffMs = Math.max(0, endTime - startTime);
    const totalSeconds = Math.floor(diffMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);

    if (totalSeconds < 60) {
      return `${totalSeconds} sec`;
    }

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

  private inferConnections(steps: TaskExecutionStep[]) {
    const connections: FlowData['connections'] = [];
    const indexedSteps = steps.map((step, index) => ({ step, index }));

    for (const targetEntry of indexedSteps) {
      const targetStep = targetEntry.step;
      for (const input of targetStep.inputs ?? []) {
        if (!input.registered) continue;

        const candidates = indexedSteps
          .filter(({ step }) => step.id !== targetStep.id)
          .flatMap((sourceEntry) =>
            (sourceEntry.step.outputs ?? [])
              .filter((output) => output.connected && output.descriptor.type === input.descriptor.type)
              .map((output) => ({
                sourceStep: sourceEntry.step,
                sourceIndex: sourceEntry.index,
                sourceOutputName: output.descriptor.name
              }))
          );

        if (!candidates.length) continue;

        const source = this.pickBestConnectionCandidate(candidates, targetEntry.index);
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

  private getExecutionConnections(steps: TaskExecutionStep[]): FlowBlockConnection[] {
    const explicitConnections = this.execution()?.stepConnections;
    if (explicitConnections?.length) {
      return explicitConnections.map((connection) => ({
        id: String(connection.id),
        sourceId: String(connection.sourceId),
        sourceName: String(connection.sourceName),
        targetId: String(connection.targetId),
        targetName: String(connection.targetName)
      }));
    }

    return this.inferConnections(steps);
  }

  private pickBestConnectionCandidate(
    candidates: Array<{ sourceStep: TaskExecutionStep; sourceIndex: number; sourceOutputName: string }>,
    targetIndex: number
  ) {
    const previousCandidates = candidates
      .filter((candidate) => candidate.sourceIndex < targetIndex)
      .sort((left, right) => right.sourceIndex - left.sourceIndex);

    if (previousCandidates.length) {
      return previousCandidates[0];
    }

    return [...candidates].sort((left, right) => left.sourceIndex - right.sourceIndex)[0];
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

  private isInputSet(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }
}
