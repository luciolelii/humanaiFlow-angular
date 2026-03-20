import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, Input, inject } from '@angular/core';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { BlockInteractionContract, BlockType, FlowBlock, FlowContainer, FlowData, FlowPort } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { SubflowPreviewDialogService } from '@services/dialogs/subflow-preview-dialog';
import { HumanInteractionDialogService } from '@services/dialogs/human-interaction-dialog';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import {
  type UiConditionRule,
  evaluateUiConditionRule,
  flattenPrimitiveValues,
  parentPath,
  pathToLabel,
  readUiConditionRule,
  readUiGroup,
  resolveSchemaRef,
  resolveSchemaPath,
  schemaFieldLabel,
  shouldSkipSchemaField,
  splitTemplatedTextParts,
  toStringOrNull,
  valueToDisplayString
} from '../node-utility';

type DisplayField = {
  path: string;
  label: string;
  value: string;
  wide: boolean;
};

type ArrayFieldDefinition = {
  path: string;
  label: string;
  itemSchema: Record<string, any> | null;
};

type ArrayFieldItemView = {
  index: number;
  summary: string;
};

type ArrayFieldView = {
  path: string;
  label: string;
  items: ArrayFieldItemView[];
};

type DisplayFieldGroup = {
  key: string;
  legend: string;
  fields: DisplayField[];
};

type MainContentView = {
  path: string;
  label: string;
  parts: { text: string; isDynamicInput: boolean }[];
};

type PortLabelParts = {
  context: string | null;
  name: string;
};

@Component({
  selector: 'app-task-step-node',
  imports: [CommonModule, ReteModule],
  templateUrl: './task-step-node.html',
  styleUrl: './task-step-node.css',
  host: {
    'data-testid': 'task-step-node'
  }
})
export class TaskStepNodeComponent {
  private blocksService = inject(BlocksService);
  private containersService = inject(ContainersService);
  private subflowPreview = inject(SubflowPreviewDialogService);
  private cdr = inject(ChangeDetectorRef);
  private humanInteractionDialog = inject(HumanInteractionDialogService);
  private taskExecutionsService = inject(TaskExecutionsService);

  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  @HostBinding('class.selected') get selected() {
    return this.data.selected;
  }

  @HostBinding('class.llm-node-readonly') readonlyClass = true;

  outputs: { key: string; socket: ClassicPreset.Socket }[] = [];
  inputs: { key: string; socket: ClassicPreset.Socket }[] = [];
  parameterFields: DisplayField[] = [];
  parameterFieldGroups: DisplayFieldGroup[] = [];
  arrayFields: ArrayFieldView[] = [];

  name = 'Step';
  mainContentFields: MainContentView[] = [];
  interactionSubmitting = false;

  private blockSchema: Record<string, any> | null = null;
  private blockDescriptor: BlockType | null = null;
  private variablePlaceholderPaths = new Set<string>();
  private arrayFieldDefinitions: ArrayFieldDefinition[] = [];
  private mainContentPaths = new Set<string>();

  ngOnInit() {
    this.outputs = [];
    this.inputs = [];
    this.parameterFields = [];
    this.parameterFieldGroups = [];
    this.arrayFields = [];

    Object.entries(this.data.outputs).forEach(([key, output]) => {
      this.outputs.push({ key, socket: (output as any).socket });
    });

    Object.entries(this.data.inputs).forEach(([key, input]) => {
      this.inputs.push({ key, socket: (input as any).socket });
    });

    this.rebuildDisplayState();
    void this.loadSchemaContext();
  }

  private rebuildDisplayState() {
    const config = this.blockConfiguration ?? {};
    this.name = toStringOrNull(config['name']) ?? this.name;
    const arrayFieldPaths = new Set(this.arrayFieldDefinitions.map((definition) => definition.path));
    const primitiveEntries = flattenPrimitiveValues(config)
      .filter((entry) => !this.shouldHideConfigPath(entry.path))
      .filter((entry) => !arrayFieldPaths.has(entry.path));
    const visibleEntries = primitiveEntries.filter((entry) => this.isPathVisible(entry.path));
    const mainContentEntries = visibleEntries
      .filter((entry) => this.mainContentPaths.has(entry.path))
      .filter((entry) => typeof entry.value === 'string' && String(entry.value).trim().length > 0);
    const richContentPaths = mainContentEntries.map((entry) => entry.path);
    this.mainContentFields = mainContentEntries.map((entry) => ({
      path: entry.path,
      label: this.displayLabelForPath(entry.path),
      parts: this.toMainContentParts(entry.path, String(entry.value))
    }));
    this.arrayFields = this.arrayFieldDefinitions
      .filter((definition) => this.isPathVisible(definition.path))
      .map((definition) => ({
        path: definition.path,
        label: definition.label,
        items: this.toArrayFieldItems(definition, this.getByPath(config, definition.path))
      }));

    const grouped = new Map<string, DisplayField[]>();
    const rootFields: DisplayField[] = [];
    const orderedFields = visibleEntries
      .filter((entry) => !['name', 'type'].includes(entry.path))
      .filter((entry) => !richContentPaths.includes(entry.path))
      .filter((entry) => !this.isEmptyDisplayValue(entry.value))
      .map((entry) => ({
        path: entry.path,
        label: this.displayLabelForPath(entry.path),
        value: valueToDisplayString(entry.value),
        wide: this.shouldRenderWideField(this.displayLabelForPath(entry.path), this.mainContentPaths.has(entry.path))
      }));

    for (const field of orderedFields) {
      const groupLabel = this.groupLabelForPath(field.path);
      const groupKey = groupLabel ? `group:${groupLabel}` : null;
      if (!groupKey || !groupLabel) {
        rootFields.push(field);
        continue;
      }
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey)!.push(field);
    }

    this.parameterFields = rootFields;
    this.parameterFieldGroups = Array.from(grouped.entries()).map(([key, fields]) => ({
      key,
      legend: key.startsWith('group:') ? key.slice('group:'.length) : this.displayLabelForPath(key),
      fields
    }));

    this.refreshView();
  }

  ngAfterViewInit() {
    this.rendered();
  }

  isHumanNode(): boolean {
    return !!this.interactionContract();
  }

  isConditionalNode(): boolean {
    const outputNames = this.resolvePorts('output').map((port) => port.name.trim().toLowerCase());
    return outputNames.includes('true') && outputNames.includes('false');
  }

  nodeTitle(): string {
    const type = this.blockType;
    if (!type) return 'Task Step';
    return type
      .replace(/Block$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();
  }

  outputsTitle(): string {
    return this.isConditionalNode() ? 'On Condition' : 'Outputs';
  }

  outputPillClass(outputKey: string): string | null {
    if (!this.isConditionalNode()) return null;

    const normalized = outputKey.trim().toLowerCase();
    if (normalized === 'true') return 'llm-pill-output-true';
    if (normalized === 'false') return 'llm-pill-output-false';
    return null;
  }

  inputDisplayLabel(inputKey: string): string {
    return this.portDisplayLabel('input', inputKey);
  }

  outputDisplayLabel(outputKey: string): string {
    return this.portDisplayLabel('output', outputKey);
  }

  inputKindLabel(inputKey: string): string {
    return this.portKindLabel('input', inputKey);
  }

  outputKindLabel(outputKey: string): string {
    return this.portKindLabel('output', outputKey);
  }

  inputDisplayLabelParts(inputKey: string): PortLabelParts {
    return this.toPortLabelParts(this.inputDisplayLabel(inputKey));
  }

  outputDisplayLabelParts(outputKey: string): PortLabelParts {
    return this.toPortLabelParts(this.outputDisplayLabel(outputKey));
  }

  hasMainContent(): boolean {
    return this.mainContentFields.length > 0;
  }

  isContainerNode(): boolean {
    return this.data?.data?.nodeFamily === 'container';
  }

  hasViewableSubflow(): boolean {
    const subFlow = this.subFlow();
    return !!subFlow && ((subFlow.blocks?.length ?? 0) > 0 || (subFlow.containers?.length ?? 0) > 0 || (subFlow.connections?.length ?? 0) > 0);
  }

  formatDynamicInputToken(token: string): string {
    const match = token.match(/^\$\{\{\s*([^}]+?)\s*\}\}$/);
    return match ? match[1] : token;
  }

  executionInputTooltip(inputName: string): string | null {
    const values = this.blockConfiguration?.['__executionInputs'] as Record<string, unknown> | undefined;
    if (!values || !Object.prototype.hasOwnProperty.call(values, inputName)) return null;

    const value = values[inputName];
    if (value == null) return 'not ready yet';
    if (typeof value === 'string') return value.trim().length > 0 ? value : null;

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  isInputConnected(inputName: string): boolean {
    const connectedInputs = this.blockConfiguration?.['__connectedInputs'];
    if (!Array.isArray(connectedInputs)) return true;
    return connectedInputs.includes(inputName);
  }

  inputValueTooltip(inputName: string): string {
    return this.executionInputTooltip(inputName) ?? 'not ready yet';
  }

  showInputTooltip(): boolean {
    const statusGroup = this.blockConfiguration?.['__executionStatusGroup'];
    return statusGroup !== 'INIT';
  }

  executionOutputTooltip(outputName: string): string | null {
    const values = this.blockConfiguration?.['__executionOutputs'] as Record<string, unknown> | undefined;
    if (!values || !Object.prototype.hasOwnProperty.call(values, outputName)) return null;

    const value = values[outputName];
    if (value === undefined) return null;
    if (typeof value === 'string') return value.trim().length > 0 ? value : null;

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  isOutputConnected(outputName: string): boolean {
    const connectedOutputs = this.blockConfiguration?.['__connectedOutputs'];
    if (!Array.isArray(connectedOutputs)) return true;
    return connectedOutputs.includes(outputName);
  }

  outputValueTooltip(outputName: string): string {
    return this.executionOutputTooltip(outputName) ?? 'No output result';
  }

  showOutputTooltip(): boolean {
    return this.showInputTooltip();
  }

  executionErrors(): string[] {
    return this.getExecutionMessages('__executionErrors');
  }

  hasExecutionErrors(): boolean {
    return this.executionErrors().length > 0;
  }

  executionWarnings(): string[] {
    return this.getExecutionMessages('__executionWarnings');
  }

  hasExecutionWarnings(): boolean {
    return this.executionWarnings().length > 0;
  }

  needsAttention(): boolean {
    return this.blockConfiguration?.['__isWaitingStep'] === true;
  }

  isCompleted(): boolean {
    return this.stepStatus() === 'COMPLETED';
  }

  isRunning(): boolean {
    return this.stepStatus() === 'RUNNING';
  }

  isSkipped(): boolean {
    return this.stepStatus() === 'SKIPPED';
  }

  stepStatus(): string {
    const status = this.blockConfiguration?.['__stepStatus'];
    return typeof status === 'string' ? status.toUpperCase() : '';
  }

  async openInteractionModal(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.interactionSubmitting) return;

    const executionId = this.executionId();
    const executionNodeId = this.executionNodeId();
    const contract = this.interactionContract();
    if (!executionId || !executionNodeId || !contract) return;

    this.humanInteractionDialog.open({
      ...this.buildInteractionDialogState(executionId, executionNodeId, contract),
      onSubmit: (result) => {
        this.submitInteractionResult(executionId, executionNodeId, contract, result);
      }
    });
  }

  openSubflowPreview(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const subFlow = this.subFlow();
    if (!subFlow) return;
    this.subflowPreview.open(subFlow, `${this.name || this.nodeTitle()} subflow`);
  }

  private get blockConfiguration(): Record<string, any> | null {
    return this.data?.data?.specificConfiguration ?? null;
  }

  private get blockType(): string | null {
    const typeName = this.data?.data?.typeName;
    return typeof typeName === 'string' && typeName.length > 0 ? typeName : null;
  }

  private actionDescriptionValue(): string {
    const value = this.blockConfiguration?.['actionDescription'];
    if (typeof value === 'string') return value;
    return '';
  }

  private currentInputValue(): string {
    const inputKey = this.inputs[0]?.key ?? 'input';
    return this.executionInputTooltip(inputKey) ?? 'not ready yet';
  }

  private executionId(): string | null {
    const value = this.blockConfiguration?.['__executionId'];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private executionNodeId(): string | null {
    const value = this.blockConfiguration?.['__executionNodeId'];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private getExecutionMessages(key: '__executionErrors' | '__executionWarnings'): string[] {
    const values = this.blockConfiguration?.[key];
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }

  private portDisplayLabel(kind: 'input' | 'output', key: string): string {
    const ports = this.resolvePorts(kind);
    const port = ports.find((candidate) => candidate.name === key);
    return port?.name ?? key;
  }

  private toPortLabelParts(label: string): PortLabelParts {
    if (!this.isContainerNode()) {
      return {
        context: null,
        name: label
      };
    }

    const trimmed = String(label ?? '').trim();
    const separatorIndex = trimmed.lastIndexOf('.');
    if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
      return {
        context: null,
        name: trimmed
      };
    }

    return {
      context: trimmed.slice(0, separatorIndex),
      name: trimmed.slice(separatorIndex + 1)
    };
  }

  private portTypeLabel(port: FlowPort): string {
    const type = String(port.type ?? 'TEXT').toUpperCase();
    return port.multiple ? `${type}[]` : type;
  }

  private portKindLabel(kind: 'input' | 'output', key: string): string {
    const ports = this.resolvePorts(kind);
    const port = ports.find((candidate) => candidate.name === key);
    return port ? this.portTypeLabel(port) : 'ANY';
  }

  private resolvePorts(kind: 'input' | 'output'): FlowPort[] {
    const ports = this.data?.data?.[kind === 'input' ? 'inputs' : 'outputs'];
    return Array.isArray(ports) ? ports as FlowPort[] : [];
  }

  private toMainContentParts(path: string, value: string): { text: string; isDynamicInput: boolean }[] {
    if (this.variablePlaceholderPaths.has(path)) {
      return splitTemplatedTextParts(value);
    }
    return [{ text: value, isDynamicInput: false }];
  }

  private async loadSchemaContext() {
    const type = this.blockType;
    if (!type) return;

    const nodeFamily = this.data?.data?.nodeFamily === 'container'
      ? 'container'
      : 'block';
    const typeDescriptor = nodeFamily === 'container'
      ? await this.containersService.getContainerType(type)
      : await this.blocksService.getBlockType(type);
    this.blockDescriptor = (typeDescriptor ?? null) as BlockType | null;
    this.blockSchema = (typeDescriptor?.schema ?? null) as Record<string, any> | null;
    this.variablePlaceholderPaths = this.extractVariablePlaceholderPaths(this.blockSchema);
    this.arrayFieldDefinitions = this.extractArrayFieldDefinitions(this.blockSchema);
    this.mainContentPaths = this.extractMainContentPaths(this.blockSchema);
    this.rebuildDisplayState();
  }

  private interactionContract(): BlockInteractionContract | null {
    return this.blockDescriptor?.interactionContract ?? null;
  }

  private interactionDialogTitle(contract: BlockInteractionContract): string {
    if (contract.kind === 'chat-session') {
      return `Chat with ${this.name || 'Interaction Step'}`;
    }
    return `Send response for ${this.name || 'Interaction Step'}`;
  }

  private executionPartialResult(): Record<string, unknown> | null {
    const value = this.blockConfiguration?.['__executionPartialResult'];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private executionResultData(): Record<string, unknown> | null {
    const value = this.blockConfiguration?.['__executionResultData'];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private stepResultData(): Record<string, unknown> | null {
    const value = this.blockConfiguration?.['__stepResultData'];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private executionScopedFieldName(fieldName: string): string | null {
    const nodeId = this.executionNodeId();
    return nodeId ? `${nodeId}:${fieldName}` : null;
  }

  private interactionFieldValue(fieldName: string | null | undefined, preferPartial: boolean): unknown {
    if (!fieldName) return undefined;

    if (!preferPartial) {
      const stepSource = this.stepResultData();
      if (stepSource && Object.prototype.hasOwnProperty.call(stepSource, fieldName)) {
        return stepSource[fieldName];
      }
    }

    const scopedFieldName = this.executionScopedFieldName(fieldName);
    const executionSource = preferPartial ? this.executionPartialResult() : this.executionResultData();
    if (executionSource) {
      if (Object.prototype.hasOwnProperty.call(executionSource, fieldName)) {
        return executionSource[fieldName];
      }
      if (scopedFieldName && Object.prototype.hasOwnProperty.call(executionSource, scopedFieldName)) {
        return executionSource[scopedFieldName];
      }
    }

    return undefined;
  }

  private chatHistory(contract: BlockInteractionContract): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    const historyField = this.resolveInteractionFieldName(contract, 'history');
    const latestResponse = this.latestInteractionResponse(contract);
    if (!historyField) {
      return latestResponse
        ? [{ role: 'assistant', content: latestResponse }]
        : [];
    }

    const rawHistory =
      this.interactionFieldValue(historyField, true)
      ?? this.interactionFieldValue(historyField, false);
    const normalizedHistory = !Array.isArray(rawHistory)
      ? []
      : rawHistory
      .map((entry) => {
        if (typeof entry === 'string') {
          return this.parseChatHistoryLine(entry);
        }
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const role = record['role'];
        const content = record['content'] ?? record['message'] ?? record['text'];
        if ((role !== 'user' && role !== 'assistant' && role !== 'system') || typeof content !== 'string') {
          return null;
        }
        return { role, content };
      })
      .filter((entry): entry is { role: 'user' | 'assistant' | 'system'; content: string } => entry != null);

    if (!latestResponse) return normalizedHistory;

    const lastMessage = normalizedHistory[normalizedHistory.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.content === latestResponse) {
      return normalizedHistory;
    }

    return [
      ...normalizedHistory,
      { role: 'assistant', content: latestResponse }
    ];
  }

  private latestInteractionResponse(contract: BlockInteractionContract): string {
    const fieldName = this.resolveInteractionFieldName(contract, 'response');
    if (!fieldName) return '';
    const value =
      this.interactionFieldValue(fieldName, true)
      ?? this.interactionFieldValue(fieldName, false);
    return typeof value === 'string' ? value : '';
  }

  private resolveInteractionFieldName(
    contract: BlockInteractionContract,
    target: 'history' | 'response'
  ): string | null {
    const explicit = target === 'history'
      ? contract.historyField
      : contract.responseField;
    if (explicit) return explicit;

    if (contract.kind !== 'chat-session') return null;
    return target;
  }

  private buildInteractionDialogState(executionId: string, executionNodeId: string, contract: BlockInteractionContract) {
    return {
      executionId,
      nodeId: executionNodeId,
      title: this.interactionDialogTitle(contract),
      kind: contract.kind,
      actionDescription: this.actionDescriptionValue(),
      currentInput: this.currentInputValue(),
      history: this.chatHistory(contract),
      latestResponse: this.latestInteractionResponse(contract),
      historyField: contract.historyField,
      responseField: contract.responseField,
      messageField: contract.messageField,
      completionField: contract.completionField,
      pendingUserMessage: null,
      awaitingAssistantResponse: false,
      assistantResponseBaseline: this.latestInteractionResponse(contract),
      isRunning: this.isRunning(),
      isSubmitting: this.interactionSubmitting,
      submitError: null
    };
  }

  private submitInteractionResult(
    executionId: string,
    executionNodeId: string,
    contract: BlockInteractionContract,
    result: { mode: 'message' | 'complete'; value: string }
  ) {
    const interactionFieldName = result.mode === 'message'
      ? contract.messageField
      : contract.completionField;
    if (!interactionFieldName) return;

    this.interactionSubmitting = true;
    this.humanInteractionDialog.update({
      pendingUserMessage: result.value,
      awaitingAssistantResponse: true,
      assistantResponseBaseline: this.latestInteractionResponse(contract),
      isSubmitting: true,
      submitError: null
    });
    this.taskExecutionsService.submitInteractionText(
      executionId,
      executionNodeId,
      interactionFieldName,
      result.value
    ).subscribe({
      next: () => {
        this.interactionSubmitting = false;
        this.humanInteractionDialog.update({
          isSubmitting: false,
          submitError: null
        });
      },
      error: (error) => {
        this.interactionSubmitting = false;
        this.humanInteractionDialog.update({
          isSubmitting: false,
          submitError: 'Failed to send the interaction response.'
        });
        console.error('Submit interaction output failed', error);
      }
    });
  }

  private parseChatHistoryLine(rawLine: string): { role: 'user' | 'assistant' | 'system'; content: string } | null {
    const line = rawLine.trim();
    if (!line) return null;

    const prefixed = line.match(/^\[(USER|ASSISTANT|SYSTEM)\]\s*([\s\S]*)$/i);
    if (prefixed) {
      const role = prefixed[1].toLowerCase() as 'user' | 'assistant' | 'system';
      return {
        role,
        content: prefixed[2] ?? ''
      };
    }

    return {
      role: 'assistant',
      content: line
    };
  }

  private extractVariablePlaceholderPaths(schema: Record<string, any> | null): Set<string> {
    const paths = new Set<string>();
    if (!schema) return paths;

    const walk = (node: Record<string, any>, pathPrefix: string) => {
      const resolved = resolveSchemaRef(node, schema);
      if (!resolved || typeof resolved !== 'object') return;

      const properties = resolved.properties as Record<string, any> | undefined;
      if (!properties) return;

      for (const [key, childSchema] of Object.entries(properties)) {
        const childResolved = resolveSchemaRef(childSchema as Record<string, any>, schema);
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;
        const hasChildren = !!childResolved?.properties || childResolved?.type === 'object';
        if (hasChildren) {
          walk(childResolved as Record<string, any>, path);
          continue;
        }

        const rawWidget = typeof childResolved?.['x-ui-widget'] === 'string'
          ? String(childResolved['x-ui-widget']).toLowerCase().trim()
          : '';
        const isTextarea = rawWidget === 'textarea' || rawWidget === 'text-area';
        const acceptsVariable = childResolved?.['x-ui-accept-variable-as-placeholder'] === true;
        if (isTextarea && acceptsVariable) {
          paths.add(path);
        }
      }
    };

    walk(schema, '');
    return paths;
  }

  private extractArrayFieldDefinitions(schema: Record<string, any> | null): ArrayFieldDefinition[] {
    if (!schema) return [];

    const definitions: ArrayFieldDefinition[] = [];
    const seen = new Set<string>();

    const walk = (node: Record<string, any>, pathPrefix: string) => {
      const resolved = resolveSchemaRef(node, schema);
      if (!resolved || typeof resolved !== 'object') return;

      const properties = resolved.properties as Record<string, any> | undefined;
      if (!properties) return;

      for (const [key, childSchema] of Object.entries(properties)) {
        const childResolved = resolveSchemaRef(childSchema as Record<string, any>, schema);
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;

        if (childResolved?.type === 'array') {
          if (shouldSkipSchemaField(key, childResolved) || key === 'name' || seen.has(path)) {
            continue;
          }
          seen.add(path);
          definitions.push({
            path,
            label: schemaFieldLabel(path, childResolved),
            itemSchema: this.resolveArrayItemSchema(childResolved, schema)
          });
          continue;
        }

        const hasChildren = !!childResolved?.properties || childResolved?.type === 'object';
        if (hasChildren) {
          walk(childResolved as Record<string, any>, path);
        }
      }
    };

    walk(schema, '');
    return this.isContainerNode()
      ? definitions.filter((definition) => !definition.path.startsWith('subFlow.'))
      : definitions;
  }

  private subFlow(): FlowData | null {
    if (!this.isContainerNode()) return null;

    const raw = this.blockConfiguration?.['subFlow'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const candidate = raw as Record<string, unknown>;
    const blocks = this.normalizeSubFlowBlocks(candidate['blocks']);
    const containers = this.normalizeSubFlowContainers(candidate['containers']);
    const connections = Array.isArray(candidate['connections'])
      ? candidate['connections'].filter((item): item is FlowData['connections'][number] => !!item && typeof item === 'object')
      : [];

    if (!blocks.length && !containers.length && !connections.length) return null;
    return { blocks, containers, connections };
  }

  private normalizeSubFlowBlocks(raw: unknown): FlowBlock[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        ...item,
        nodeFamily: 'block',
        position: this.normalizePosition(item['position'])
      })) as FlowBlock[];
  }

  private normalizeSubFlowContainers(raw: unknown): FlowContainer[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        ...item,
        nodeFamily: 'container',
        position: this.normalizePosition(item['position'])
      })) as FlowContainer[];
  }

  private normalizePosition(raw: unknown): { x: number; y: number } | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    const x = typeof value['x'] === 'number' ? value['x'] : Number(value['x']);
    const y = typeof value['y'] === 'number' ? value['y'] : Number(value['y']);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x, y };
  }

  private shouldHideConfigPath(path: string): boolean {
    return this.isContainerNode() && (path === 'subFlow' || path.startsWith('subFlow.'));
  }

  private extractMainContentPaths(schema: Record<string, any> | null): Set<string> {
    const paths = new Set<string>();
    if (!schema) return paths;

    const walk = (node: Record<string, any>, pathPrefix: string) => {
      const resolved = resolveSchemaRef(node, schema);
      if (!resolved || typeof resolved !== 'object') return;

      const properties = resolved.properties as Record<string, any> | undefined;
      if (!properties) return;

      for (const [key, childSchema] of Object.entries(properties)) {
        const childResolved = resolveSchemaRef(childSchema as Record<string, any>, schema);
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;
        const hasChildren = !!childResolved?.properties || childResolved?.type === 'object';

        if (hasChildren) {
          walk(childResolved as Record<string, any>, path);
          continue;
        }

        const rawWidget = typeof childResolved?.['x-ui-widget'] === 'string'
          ? String(childResolved['x-ui-widget']).toLowerCase().trim()
          : '';
        const isTextarea = rawWidget === 'textarea' || rawWidget === 'text-area';
        const acceptsVariable = childResolved?.['x-ui-accept-variable-as-placeholder'] === true;
        if (isTextarea && acceptsVariable) {
          paths.add(path);
        }
      }
    };

    walk(schema, '');
    return paths;
  }

  private toArrayFieldItems(definition: ArrayFieldDefinition, value: unknown): ArrayFieldItemView[] {
    if (!Array.isArray(value)) return [];

    return value.map((item, index) => ({
      index,
      summary: this.toArrayItemSummary(definition, item, index)
    }));
  }

  private toArrayItemSummary(definition: ArrayFieldDefinition, item: unknown, index: number) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return `Item ${index + 1}`;
    }

    const properties = definition.itemSchema?.['properties'] as Record<string, any> | undefined;
    if (!properties) return `Item ${index + 1}`;

    const summaryParts: string[] = [];
    for (const key of Object.keys(properties)) {
      const value = (item as Record<string, unknown>)[key];
      if (value == null) continue;
      if (typeof value === 'string' && value.trim().length > 0) {
        summaryParts.push(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        summaryParts.push(String(value));
      }
      if (summaryParts.length === 2) break;
    }

    return summaryParts.length ? summaryParts.join(' · ') : `Item ${index + 1}`;
  }

  private resolveArrayItemSchema(node: Record<string, any> | null | undefined, root: Record<string, any>) {
    const items = node?.['items'];
    if (!items || typeof items !== 'object') return null;
    const resolved = resolveSchemaRef(items as Record<string, any>, root);
    return resolved && typeof resolved === 'object' ? resolved as Record<string, any> : null;
  }

  private getByPath(source: Record<string, any>, path: string): unknown {
    const keys = path.split('.').filter(Boolean);
    let current: unknown = source;
    for (const key of keys) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private displayLabelForPath(path: string): string {
    return schemaFieldLabel(path, this.resolveFieldSchema(path));
  }

  private shouldRenderWideField(label: string, isTextarea: boolean) {
    return isTextarea || label.trim().length >= 18;
  }

  private isEmptyDisplayValue(value: unknown) {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  private refreshView() {
    queueMicrotask(() => {
      try {
        this.cdr.detectChanges();
      } catch {
        // Node may have been removed while async updates were running.
      }
    });
  }

  private isPathVisible(path: string, visited = new Set<string>()): boolean {
    if (visited.has(path)) return true;
    visited.add(path);

    const ui = this.getFieldUiMeta(path);
    return ui.visibleWhen.every((rule) => {
      if (!rule) return true;
      if (!this.isPathVisible(rule.field, visited)) return false;
      return evaluateUiConditionRule(rule, this.blockConfiguration, (fieldPath) => this.resolveFieldSchema(fieldPath));
    });
  }

  private groupLabelForPath(path: string): string | null {
    return this.getFieldUiMeta(path).group ?? parentPath(path);
  }

  private resolveFieldSchema(path: string): Record<string, any> | null {
    return resolveSchemaPath(this.blockSchema, path);
  }

  private getFieldUiMeta(path: string) {
    const root = this.blockSchema;
    if (!root) return this.toFieldUiMeta(null);

    let current: Record<string, any> | null = root;
    let inheritedUi = { visibleWhen: [] as UiConditionRule[], group: null as string | null };

    for (const segment of path.split('.')) {
      if (!current) return this.toFieldUiMeta(null, inheritedUi);
      const resolved = resolveSchemaRef(current, root);
      if (/^\d+$/.test(segment)) {
        const items = resolved?.items;
        if (!items || typeof items !== 'object') return this.toFieldUiMeta(null, inheritedUi);
        current = resolveSchemaRef(items as Record<string, any>, root);
      } else {
        const properties = resolved?.properties as Record<string, unknown> | undefined;
        if (!properties || !properties[segment]) return this.toFieldUiMeta(null, inheritedUi);
        current = resolveSchemaRef(properties[segment] as Record<string, any>, root);
      }
      const nextUi = this.toFieldUiMeta(current, inheritedUi);
      inheritedUi = {
        visibleWhen: nextUi.visibleWhen,
        group: nextUi.group
      };
    }

    return this.toFieldUiMeta(current, inheritedUi);
  }

  private toFieldUiMeta(
    schema: Record<string, any> | null | undefined,
    inheritedUi?: { visibleWhen: UiConditionRule[]; group: string | null }
  ) {
    const visibleWhen = readUiConditionRule(schema?.['x-ui-visible-when']);
    const group = readUiGroup(schema?.['x-ui-group']) ?? inheritedUi?.group ?? null;

    return {
      visibleWhen: [
        ...(inheritedUi?.visibleWhen ?? []),
        ...(visibleWhen ? [visibleWhen] : [])
      ],
      group
    };
  }

}
