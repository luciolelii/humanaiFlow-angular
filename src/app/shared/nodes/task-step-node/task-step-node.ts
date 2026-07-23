import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Input, inject } from '@angular/core';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { BiasAnnotation, BlockInteractionContract, BlockType, DEFAULT_NODE_CAPABILITIES, FlowData, FlowPort, isProbeExecutable, FLOW_DEPENDANT_PORT_KEY, FLOW_DEPENDENCY_PORT_KEY, NodeTypeCapabilities } from '@models/flow';
import { BiasCapabilities } from '@models/bias-impact';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { SubflowPreviewDialogService } from '@services/dialogs/subflow-preview-dialog';
import { HumanInteractionDialogService } from '@services/dialogs/human-interaction-dialog';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { BiasImpactExperimentDialogService } from '@services/dialogs/bias-impact-experiment-dialog';
import { BiasComparisonViewStateService } from '@services/bias/bias-comparison-view-state';
import { take } from 'rxjs';
import {
  collectSchemaFlowDataFields,
  isFlowDataFieldPath,
  normalizeFlowDataValue,
  type SchemaFlowDataFieldDefinition
} from '../flow-data-schema-fields';
import {
  type UiConditionRule,
  evaluateUiConditionRule,
  flattenPrimitiveValues,
  formatNodeTitle,
  getOutputPillClass,
  getOutputsTitle,
  isConditionalByPorts,
  isHumanInteractiveNode,
  orderedSchemaPropertyEntries,
  parentPath,
  pathToLabel,
  readUiConditionRule,
  readEffectiveUiVisibleConditionRule,
  readUiGroup,
  readUiLabel,
  resolveNodeIcon,
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
  expandable: boolean;
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
  rawValue: string;
  expandable: boolean;
  parts: { text: string; isDynamicInput: boolean }[];
};

type PortLabelParts = {
  context: string | null;
  name: string;
};

type FieldUiMeta = {
  visibleWhen: UiConditionRule[];
  group: string | null;
  widget: 'textarea' | null;
  acceptVariableAsPlaceholder: boolean;
};

@Component({
  selector: 'app-task-step-node',
  imports: [CommonModule, ReteModule],
  templateUrl: './task-step-node.html',
  styleUrl: './task-step-node.css',
  host: {
    'data-testid': 'task-step-node'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskStepNodeComponent {
  private static readonly globalFieldSchemaCache = new Map<string, Map<string, Record<string, any> | null>>();
  private static readonly globalFieldUiMetaCache = new Map<string, Map<string, FieldUiMeta>>();
  private static readonly globalFieldLabelCache = new Map<string, Map<string, string>>();

  private blocksService = inject(BlocksService);
  private containersService = inject(ContainersService);
  private settingsDialog = inject(NodeSettingsDialogService);
  private subflowPreview = inject(SubflowPreviewDialogService);
  private cdr = inject(ChangeDetectorRef);
  private humanInteractionDialog = inject(HumanInteractionDialogService);
  private taskExecutionsService = inject(TaskExecutionsService);
  private biasImpactExperimentDialog = inject(BiasImpactExperimentDialogService);
  private biasComparisonViewState = inject(BiasComparisonViewStateService);

  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  @HostBinding('class.selected') get selected() {
    return this.data.selected;
  }

  @HostBinding('class.llm-node-readonly') readonlyClass = true;

  parameterFields: DisplayField[] = [];
  parameterFieldGroups: DisplayFieldGroup[] = [];
  arrayFields: ArrayFieldView[] = [];

  name = 'Step';
  mainContentFields: MainContentView[] = [];
  interactionSubmitting = false;
  schemaReady = false;
  biasCapabilities: BiasCapabilities | null = null;

  private blockSchema: Record<string, any> | null = null;
  private blockDescriptor: BlockType | null = null;
  private arrayFieldDefinitions: ArrayFieldDefinition[] = [];
  private flowFieldDefinitions: SchemaFlowDataFieldDefinition[] = [];

  get outputs(): { key: string; socket: ClassicPreset.Socket }[] {
    return Object.entries(this.data?.outputs ?? {})
      .filter(([key]) => key !== FLOW_DEPENDANT_PORT_KEY)
      .map(([key, output]) => ({ key, socket: (output as any).socket as ClassicPreset.Socket }));
  }

  get inputs(): { key: string; socket: ClassicPreset.Socket }[] {
    return Object.entries(this.data?.inputs ?? {})
      .filter(([key]) => key !== FLOW_DEPENDENCY_PORT_KEY)
      .map(([key, input]) => ({ key, socket: (input as any).socket as ClassicPreset.Socket }));
  }

  get dependantOutput(): { key: string; socket: ClassicPreset.Socket } | null {
    const output = this.data?.outputs?.[FLOW_DEPENDANT_PORT_KEY];
    return output
      ? { key: FLOW_DEPENDANT_PORT_KEY, socket: (output as any).socket as ClassicPreset.Socket }
      : null;
  }

  get dependencyInput(): { key: string; socket: ClassicPreset.Socket } | null {
    const input = this.data?.inputs?.[FLOW_DEPENDENCY_PORT_KEY];
    return input
      ? { key: FLOW_DEPENDENCY_PORT_KEY, socket: (input as any).socket as ClassicPreset.Socket }
      : null;
  }

  ngOnInit() {
    this.parameterFields = [];
    this.parameterFieldGroups = [];
    this.arrayFields = [];

    this.rebuildDisplayState();
    void this.loadSchemaContext();
    this.loadBiasCapabilities();
  }

  private rebuildDisplayState() {
    const config = this.blockConfiguration ?? {};
    this.name = toStringOrNull(config['name']) ?? this.name;
    const arrayFieldPaths = new Set(this.arrayFieldDefinitions.map((definition) => definition.path));
    const primitiveEntries = flattenPrimitiveValues(config)
      .filter((entry) => !this.shouldHideConfigPath(entry.path))
      .filter((entry) => !arrayFieldPaths.has(entry.path));
    const visibleEntries = primitiveEntries.filter((entry) => this.isPathVisible(entry.path));
    const fieldMetaByPath = new Map<string, { label: string; ui: FieldUiMeta; value: string }>();
    for (const entry of visibleEntries) {
      const ui = this.getFieldUiMeta(entry.path);
      const label = this.displayLabelForPath(entry.path);
      fieldMetaByPath.set(entry.path, {
        label,
        ui,
        value: valueToDisplayString(entry.value)
      });
    }
    const mainContentEntries = visibleEntries
      .filter((entry) => fieldMetaByPath.get(entry.path)?.ui.widget === 'textarea')
      .filter((entry) => typeof entry.value === 'string' && String(entry.value).trim().length > 0);
    const richContentPaths = mainContentEntries.map((entry) => entry.path);
    this.mainContentFields = mainContentEntries.map((entry) => ({
      path: entry.path,
      label: fieldMetaByPath.get(entry.path)?.label ?? this.displayLabelForPath(entry.path),
      rawValue: String(entry.value),
      expandable: this.isLongTextValue(String(entry.value)),
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
      .map((entry) => {
        const meta = fieldMetaByPath.get(entry.path);
        const label = meta?.label ?? this.displayLabelForPath(entry.path);
        const value = meta?.value ?? valueToDisplayString(entry.value);
        return {
          path: entry.path,
          label,
          value,
          wide: this.shouldRenderWideField(label, meta?.ui.widget === 'textarea'),
          expandable: this.isLongTextValue(value)
        };
      });

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
    return isHumanInteractiveNode(this.interactionContract());
  }

  isConditionalNode(): boolean {
    return isConditionalByPorts(this.resolvePorts('output'));
  }

  nodeTitle(): string {
    return formatNodeTitle(this.blockType, 'Task Step');
  }

  outputsTitle(): string {
    return getOutputsTitle(this.isConditionalNode());
  }

  outputPillClass(outputKey: string): string | null {
    return getOutputPillClass(outputKey, this.isConditionalNode(), this.blockDescriptor?.schema);
  }

  nodeIcon(): { type: 'class' | 'img'; value: string } {
    return resolveNodeIcon(this.blockDescriptor?.schema, this.isHumanNode());
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
    return this.resolvedNodeFamily() === 'container';
  }

  hasViewableSubflow(): boolean {
    return this.viewableSubflows().length > 0;
  }

  viewableSubflows(): Array<{ path: string; label: string; flow: FlowData }> {
    if (!this.isContainerNode()) return [];

    return this.resolveFlowFieldDefinitions()
      .map((field) => ({
        path: field.path,
        label: field.label,
        flow: this.flowAtPath(field.path)
      }))
      .filter((item): item is { path: string; label: string; flow: FlowData } => item.flow != null);
  }

  hasExecutionDependencyPorts(): boolean {
    return this.hasConnectedDependencyInput() || this.hasConnectedDependantOutput();
  }

  hasConnectedDependencyInput(): boolean {
    return !!this.dependencyInput && this.blockConfiguration?.['__hasDependencyInputConnection'] === true;
  }

  hasConnectedDependantOutput(): boolean {
    return !!this.dependantOutput && this.blockConfiguration?.['__hasDependantOutputConnection'] === true;
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

  executableBiasAnnotations(): BiasAnnotation[] {
    return this.allBiasAnnotations()
      .filter((annotation) => isProbeExecutable(annotation.behavioralProbe));
  }

  allBiasAnnotations(): BiasAnnotation[] {
    const annotations = this.data?.data?.biasAnnotations;
    return Array.isArray(annotations)
      ? annotations.filter((annotation): annotation is BiasAnnotation => !!annotation)
      : [];
  }

  activeBiasAnnotationCount(): number {
    const ids = this.blockConfiguration?.['__biasActiveAnnotationIds'];
    return Array.isArray(ids) ? ids.length : 0;
  }

  typeCapabilities(): NodeTypeCapabilities {
    return this.data?.data?.capabilities
      ?? this.blockDescriptor?.capabilities
      ?? DEFAULT_NODE_CAPABILITIES;
  }

  visualRoleLabel(): string {
    const role = this.typeCapabilities().visualRole.toLowerCase();
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  capabilitiesTooltip(): string {
    const capabilities = this.typeCapabilities();
    return [
      `Role: ${this.visualRoleLabel()}`,
      `Terminal: ${capabilities.terminal ? 'yes' : 'no'}`,
      `Incoming connections: ${capabilities.allowsIncomingConnections ? 'allowed' : 'blocked'}`,
      `Outgoing connections: ${capabilities.allowsOutgoingConnections ? 'allowed' : 'blocked'}`,
      `Dependencies: ${capabilities.canDependOnOtherNodes || capabilities.canHaveDependentNodes ? 'supported' : 'blocked'}`,
      `Bias annotations: ${capabilities.biasAnnotationsAllowed ? 'allowed' : 'blocked'}`
    ].join('\n');
  }

  hasMeasurableBiasAnnotations(): boolean {
    return this.typeCapabilities().biasAnnotationsAllowed
      && this.executableBiasAnnotations().length > 0
      && this.biasCapabilities?.isolatedExperimentSupported === true;
  }

  canMeasureBiasImpact(): boolean {
    return this.hasMeasurableBiasAnnotations() && this.blockConfiguration?.['__executionStatusGroup'] === 'FINAL';
  }

  measureBiasImpactTooltip(): string {
    if (this.blockConfiguration?.['__executionStatusGroup'] !== 'FINAL') {
      return 'Available once the execution reaches a final state';
    }
    return 'Measure bias impact';
  }

  isBiasActive(): boolean {
    const ids = this.blockConfiguration?.['__biasActiveAnnotationIds'];
    return Array.isArray(ids) && ids.length > 0;
  }

  isBiasDownstreamChanged(): boolean {
    return this.biasComparisonViewState.isNodeDownstreamChanged(this.executionNodeId());
  }

  isBiasRoutingChangeSource(): boolean {
    return this.biasComparisonViewState.isRoutingChangeSource(this.executionNodeId());
  }

  measureBiasImpact(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const executionId = this.executionId();
    const stepId = this.executionNodeId();
    const capabilities = this.biasCapabilities;
    if (!executionId || !stepId || !capabilities || !this.canMeasureBiasImpact()) return;
    this.biasImpactExperimentDialog.open({
      executionId,
      stepId,
      nodeId: String(this.data?.id ?? stepId),
      nodeName: this.nodeTitle(),
      annotations: this.executableBiasAnnotations(),
      capabilities
    });
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

  stepSkipReason(): string | null {
    const reason = this.blockConfiguration?.['__stepSkipReason'];
    return typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : null;
  }

  async openInteractionModal(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.interactionSubmitting) return;
    if (this.executionStatus() === 'SUSPENDED') return;
    if (this.isInteractionSimulationEnabled()) return;

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

  openSubflowPreview(path?: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const candidatePath = path ?? this.viewableSubflows()[0]?.path;
    const subFlow = candidatePath ? this.flowAtPath(candidatePath) : null;
    if (!subFlow) return;
    const sourceName = this.name || this.nodeTitle();
    const label = this.resolveFlowFieldDefinitions().find((field) => field.path === candidatePath)?.label ?? 'Subflow';
    this.subflowPreview.open(subFlow, `${sourceName} ${label}`, sourceName);
  }

  openFieldPreview(field: DisplayField, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!field.expandable) return;
    void this.openReadonlyTextDialog(field.label, this.resolvePreviewText(field.value));
  }

  openMainContentPreview(field: MainContentView, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!field.expandable) return;
    void this.openReadonlyTextDialog(field.label, this.resolvePreviewText(field.rawValue));
  }

  private get blockConfiguration(): Record<string, any> | null {
    return this.data?.data?.specificConfiguration ?? null;
  }

  private loadBiasCapabilities() {
    const blockType = this.blockType;
    if (!blockType) return;
    const capabilities$ = this.isContainerNode()
      ? this.containersService.retrieveBiasCapabilities(blockType)
      : this.blocksService.retrieveBiasCapabilities(blockType);
    capabilities$.pipe(take(1)).subscribe({
      next: (capabilities) => {
        this.biasCapabilities = capabilities;
        this.cdr.markForCheck();
      },
      error: () => {
        this.biasCapabilities = null;
        this.cdr.markForCheck();
      }
    });
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

  private executionStatus(): string {
    const value = this.blockConfiguration?.['__executionStatus'];
    return typeof value === 'string' ? value.toUpperCase() : '';
  }

  private isInteractionSimulationEnabled(): boolean {
    return this.blockConfiguration?.['__interactionSimulationEnabled'] === true;
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
    if (this.getFieldUiMeta(path).acceptVariableAsPlaceholder) {
      return splitTemplatedTextParts(value);
    }
    return [{ text: value, isDynamicInput: false }];
  }

  private schemaLoading = false;

  private async loadSchemaContext() {
    if (this.schemaLoading) return;
    const type = this.blockType;
    if (!type) return;

    this.schemaLoading = true;
    try {
      const nodeFamily = this.resolvedNodeFamily();
      const cachedDescriptor = nodeFamily === 'container'
        ? this.containersService.peekContainerType(type)
        : this.blocksService.peekBlockType(type);
      const typeDescriptor = cachedDescriptor ?? (
        nodeFamily === 'container'
          ? await this.containersService.getContainerType(type)
          : await this.blocksService.getBlockType(type)
      );
      this.blockDescriptor = (typeDescriptor ?? null) as BlockType | null;
      this.blockSchema = (typeDescriptor?.schema ?? null) as Record<string, any> | null;
      const typeKey = this.nodeTypeCacheKey();
      if (typeKey) {
        TaskStepNodeComponent.globalFieldSchemaCache.delete(typeKey);
        TaskStepNodeComponent.globalFieldUiMetaCache.delete(typeKey);
        TaskStepNodeComponent.globalFieldLabelCache.delete(typeKey);
      }
      this.flowFieldDefinitions = collectSchemaFlowDataFields(this.blockSchema);
      this.arrayFieldDefinitions = this.extractArrayFieldDefinitions(this.blockSchema);
      this.rebuildDisplayState();
      this.schemaReady = true;
    } finally {
      this.schemaLoading = false;
    }
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
    const executionSource = preferPartial ? this.executionPartialResult() : null;
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
    if (this.isInteractionSimulationEnabled()) return;

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
        if (result.mode === 'complete') {
          this.humanInteractionDialog.close(result);
          return;
        }
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

  private extractArrayFieldDefinitions(schema: Record<string, any> | null): ArrayFieldDefinition[] {
    if (!schema) return [];

    const definitions: ArrayFieldDefinition[] = [];
    const seen = new Set<string>();

    const walk = (node: Record<string, any>, pathPrefix: string) => {
      const resolved = resolveSchemaRef(node, schema);
      if (!resolved || typeof resolved !== 'object') return;

      const properties = orderedSchemaPropertyEntries(resolved, schema);
      if (!properties.length) return;

      for (const { key, schema: childResolved } of properties) {
        if (!childResolved) continue;
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;

        if (childResolved?.['type'] === 'array') {
          if (shouldSkipSchemaField(key, childResolved) || key === 'name' || isFlowDataFieldPath(path, this.resolveFlowFieldDefinitions()) || seen.has(path)) {
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

        const hasChildren = !!childResolved?.['properties'] || childResolved?.['type'] === 'object';
        if (hasChildren) {
          walk(childResolved as Record<string, any>, path);
        }
      }
    };

    walk(schema, '');
    return this.isContainerNode()
      ? definitions.filter((definition) => !isFlowDataFieldPath(definition.path, this.resolveFlowFieldDefinitions()))
      : definitions;
  }

  private resolveFlowFieldDefinitions(): SchemaFlowDataFieldDefinition[] {
    if (this.flowFieldDefinitions.length) return this.flowFieldDefinitions;

    const config = this.blockConfiguration ?? {};
    return Object.keys(config)
      .filter((key) => normalizeFlowDataValue(config[key]))
      .map((key) => ({
        path: key,
        label: key === 'subFlow' ? 'Subflow' : pathToLabel(key),
        retrieverBlockType: null,
        retrieverKey: null,
        retrieverUrl: null,
        retrieverStructuredData: false,
        retrieverDependsOn: [],
        validationUrl: null,
        validationType: null,
        requiresAuth: false,
        ui: {
          widget: null,
          acceptVariableAsPlaceholder: false,
          structural: true,
          bindableAsInput: false,
          inputName: null,
          inputType: null,
          inputMultiple: null,
          visibleWhen: [],
          enabledWhen: [],
          group: null
        }
      }));
  }

  private flowAtPath(path: string): FlowData | null {
    return normalizeFlowDataValue(this.getByPath(this.blockConfiguration ?? {}, path));
  }

  private shouldHideConfigPath(path: string): boolean {
    const isContainerTypePath = [
      'type',
      'typeName',
      'containerType',
      'configurationType',
      'configurationClass'
    ].some((key) => path === key || path.endsWith(`.${key}`));

    return this.isContainerNode()
      && (
        isContainerTypePath
        || isFlowDataFieldPath(path, this.resolveFlowFieldDefinitions())
      );
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
    for (const { key } of orderedSchemaPropertyEntries(definition.itemSchema, this.blockSchema ?? definition.itemSchema ?? {})) {
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
    const typeKey = this.nodeTypeCacheKey();
    if (!typeKey || !this.blockSchema) return schemaFieldLabel(path, this.resolveFieldSchema(path));

    const cache = this.getGlobalCache(TaskStepNodeComponent.globalFieldLabelCache, typeKey);
    if (cache.has(path)) {
      return cache.get(path) ?? path;
    }

    const label = schemaFieldLabel(path, this.resolveFieldSchema(path));
    cache.set(path, label);
    return label;
  }

  private shouldRenderWideField(label: string, isTextarea: boolean) {
    return isTextarea || label.trim().length >= 18;
  }

  private isEmptyDisplayValue(value: unknown): boolean {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0 || value.every((item) => this.isEmptyDisplayValue(item));
    if (typeof value === 'object') {
      const entries = Object.values(value as Record<string, unknown>);
      return entries.length === 0 || entries.every((item) => this.isEmptyDisplayValue(item));
    }
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
      return evaluateUiConditionRule(rule, this.blockConfiguration, (fieldPath) => this.resolveFieldSchema(fieldPath));
    });
  }

  private groupLabelForPath(path: string): string | null {
    return this.getFieldUiMeta(path).group ?? parentPath(path);
  }

  private resolveFieldSchema(path: string): Record<string, any> | null {
    const typeKey = this.nodeTypeCacheKey();
    if (!typeKey || !this.blockSchema) {
      return resolveSchemaPath(this.blockSchema, path);
    }

    const cache = this.getGlobalCache(TaskStepNodeComponent.globalFieldSchemaCache, typeKey);
    if (cache.has(path)) {
      return cache.get(path) ?? null;
    }

    const resolved = resolveSchemaPath(this.blockSchema, path);
    cache.set(path, resolved);
    return resolved;
  }

  private getFieldUiMeta(path: string): FieldUiMeta {
    const typeKey = this.nodeTypeCacheKey();
    const globalCache = typeKey && this.blockSchema
      ? this.getGlobalCache(TaskStepNodeComponent.globalFieldUiMetaCache, typeKey)
      : null;
    const cached = globalCache?.get(path);
    if (cached) return cached;

    const root = this.blockSchema;
    if (!root) {
      const empty = this.toFieldUiMeta(null);
      globalCache?.set(path, empty);
      return empty;
    }

    let current: Record<string, any> | null = root;
    let inheritedUi = { visibleWhen: [] as UiConditionRule[], group: null as string | null };

    for (const segment of path.split('.')) {
      if (!current) {
        const empty = this.toFieldUiMeta(null, inheritedUi);
        globalCache?.set(path, empty);
        return empty;
      }
      const resolved = resolveSchemaRef(current, root);
      if (/^\d+$/.test(segment)) {
        const items = resolved?.items;
        if (!items || typeof items !== 'object') {
          const empty = this.toFieldUiMeta(null, inheritedUi);
          globalCache?.set(path, empty);
          return empty;
        }
        current = resolveSchemaRef(items as Record<string, any>, root);
      } else {
        const properties = resolved?.properties as Record<string, unknown> | undefined;
        if (!properties || !properties[segment]) {
          const empty = this.toFieldUiMeta(null, inheritedUi);
          globalCache?.set(path, empty);
          return empty;
        }
        current = resolveSchemaRef(properties[segment] as Record<string, any>, root);
      }
      const nextUi = this.toFieldUiMeta(current, inheritedUi);
      inheritedUi = {
        visibleWhen: nextUi.visibleWhen,
        group: nextUi.group
      };
    }

    const meta = this.toFieldUiMeta(current, inheritedUi);
    globalCache?.set(path, meta);
    return meta;
  }

  private nodeTypeCacheKey(): string | null {
    const type = this.blockType;
    if (!type) return null;
    const family = this.resolvedNodeFamily();
    return `${family}:${type}`;
  }

  private resolvedNodeFamily(): 'block' | 'container' {
    if (this.data?.data?.nodeFamily === 'container') {
      return 'container';
    }

    const config = this.blockConfiguration;
    if (config && Object.values(config).some((value) => normalizeFlowDataValue(value))) {
      return 'container';
    }

    const type = this.blockType;
    if (type && this.containersService.peekContainerType(type)) {
      return 'container';
    }

    return 'block';
  }

  private getGlobalCache<T>(store: Map<string, Map<string, T>>, typeKey: string): Map<string, T> {
    let cache = store.get(typeKey);
    if (!cache) {
      cache = new Map<string, T>();
      store.set(typeKey, cache);
    }
    return cache;
  }

  private toFieldUiMeta(
    schema: Record<string, any> | null | undefined,
    inheritedUi?: { visibleWhen: UiConditionRule[]; group: string | null }
  ): FieldUiMeta {
    const visibleWhen = readEffectiveUiVisibleConditionRule(schema);
    const label = readUiLabel(schema?.['x-ui-label']);
    const isObjectLike = schema?.['type'] === 'object' || !!schema?.['properties'];
    const group = readUiGroup(schema?.['x-ui-group'])
      ?? (isObjectLike ? label ?? null : null)
      ?? inheritedUi?.group
      ?? null;
    const rawWidget = typeof schema?.['x-ui-widget'] === 'string'
      ? String(schema['x-ui-widget']).toLowerCase().trim()
      : '';
    const widget: 'textarea' | null =
      rawWidget === 'textarea' || rawWidget === 'text-area' ? 'textarea' : null;
    const acceptVariableAsPlaceholder = schema?.['x-ui-accept-variable-as-placeholder'] === true;

    return {
      visibleWhen: [
        ...(inheritedUi?.visibleWhen ?? []),
        ...(visibleWhen ? [visibleWhen] : [])
      ],
      group,
      widget,
      acceptVariableAsPlaceholder
    };
  }

  private isLongTextValue(value: string): boolean {
    const normalized = String(value ?? '');
    if (!normalized.trim()) return false;
    const lineCount = normalized.split(/\r?\n/).length;
    return lineCount > 2 || normalized.length > 80;
  }

  private async openReadonlyTextDialog(label: string, value: string) {
    await this.settingsDialog.open({
      title: label,
      previewOnly: true,
      fields: [
        {
          key: 'value',
          label,
          type: 'textarea',
          readonly: true,
          rows: 18
        }
      ],
      initial: {
        value
      }
    });
  }

  private resolvePreviewText(value: string): string {
    const source = String(value ?? '');
    if (!source.includes('${{')) return source;

    return source.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (token, rawKey: string) => {
      const key = String(rawKey ?? '').trim();
      if (!key) return token;

      const configInputs = this.blockConfiguration?.['__executionInputs'];
      const inputs = configInputs && typeof configInputs === 'object' && !Array.isArray(configInputs)
        ? configInputs as Record<string, unknown>
        : null;
      if (!inputs || !Object.prototype.hasOwnProperty.call(inputs, key)) {
        return token;
      }

      const resolved = inputs[key];
      if (resolved == null) return token;
      if (typeof resolved === 'string') return resolved;
      return valueToDisplayString(resolved);
    });
  }

}
