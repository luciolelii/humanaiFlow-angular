import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, ElementRef, HostBinding, HostListener, inject, Input, OnDestroy, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BiasAnnotation, BiasAnnotationsDescriptor, BlockType, currentFlowPortValueKind, flowValueKindLabel, FlowBlock, FlowData, FlowPort, FlowValueKind, FLOW_DEPENDANT_PORT_KEY, FLOW_DEPENDENCY_PORT_KEY, isProbeExecutable, normalizeFlowPortValueKinds } from '@models/flow';
import { BiasAnnotationsComponent } from '../../bias-annotations/bias-annotations';
import { NodeFocusModalController } from '../node-focus-modal-controller';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import {
  NodeSettingField,
  NodeSettingsDialogInput,
  NodeSettingOption,
  NodeSettingsDialogService
} from '@services/dialogs/node-settings-dialog';
import { EditorStateHolder } from '@stores/flow-editor';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { BlocksService } from '@services/blocks/blocks';
import { firstValueFrom, take } from 'rxjs';
import { ConditionalRequiredField, extractSchemaRequirements, SchemaRequirements } from '../schema-requirements';
import {
  type UiConditionRule,
  evaluateUiConditionRule,
  flattenPrimitiveValues,
  formatNodeTitle,
  getOutputPillClass,
  getOutputsTitle,
  getValueByPath,
  isConditionalByPorts,
  isHumanInteractiveNode,
  orderedSchemaPropertyEntries,
  parentPath,
  pathToLabel,
  readUiConditionRule,
  resolveNodeIcon,
  resolveSchemaRef,
  resolveSchemaPath,
  schemaFieldDescription,
  schemaFieldLabel,
  shouldSkipSchemaField,
  splitTemplatedTextParts,
  toStringOrNull,
  validateUniqueByConstraint,
  valueToDisplayString
} from '../node-utility';
import {
  buildSchemaEditableFieldDefinitions,
  buildSchemaFieldViewModel,
  buildSchemaRetrieverContext,
  pruneInactiveSchemaConfiguration,
  resetDependentSchemaRetrieverFields,
  schemaValuesEqual,
  setSchemaValueByPath,
  type SchemaEditableFieldDefinition,
  type SchemaDisplayGroup,
  type SchemaDisplayItem,
  type SchemaDisplaySection,
  type SchemaFieldType,
  type SchemaParameterFieldView,
  type SchemaRichContentFieldView,
  type SchemaFieldUiMeta,
  type SchemaNodeOptionsSource,
  type SchemaRetrieverDependency,
  buildTemplatedRichContentParts,
  buildOrderedSchemaDisplay,
  collectSchemaLeafFields,
  getSchemaPathUiMeta,
  groupSchemaFields,
  isLongTextValue,
  isSchemaPathEnabled,
  isSchemaPathVisible,
  schemaRetrieverMeta,
  schemaEnumOptions,
  schemaFieldTypeFromSchema,
  schemaNodeOptionsSource,
  toSchemaFieldUiMeta
} from '../schema-driven-fields';

type FieldType = SchemaFieldType;

type NodeOptionsSource = SchemaNodeOptionsSource;

type EditableFieldDefinition = SchemaEditableFieldDefinition;

type EditableFieldView = SchemaParameterFieldView<FieldType>;

type ArrayFieldDefinition = {
  path: string;
  label: string;
  itemSchema: Record<string, any> | null;
  uniqueBy: string | null;
  ui: {
    structural: boolean;
    visibleWhen: UiConditionRule[];
    enabledWhen: UiConditionRule[];
    group: string | null;
  };
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

type RichContentView = SchemaRichContentFieldView;

type ParameterDisplayItem = SchemaDisplayItem<EditableFieldView, RichContentView, ArrayFieldView>;

type EditableFieldGroupView = SchemaDisplayGroup<ParameterDisplayItem>;

type ParameterDisplaySection = SchemaDisplaySection<ParameterDisplayItem>;

type RenderedSocketPort = {
  key: string;
  socket: ClassicPreset.Socket;
};

@Component({
  selector: 'app-generic-node',
  imports: [CommonModule, FormsModule, ReteModule, MatTooltipModule, BiasAnnotationsComponent],
  templateUrl: './generic-node.html',
  styleUrl: './generic-node.css',
  host: {
    'data-testid': 'node'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenericNodeComponent implements OnDestroy {
  private settingsDialog = inject(NodeSettingsDialogService);
  private editorState = inject(EditorStateHolder);
  private fieldRetriever = inject(FieldRetriever);
  private blocksService = inject(BlocksService);
  private cdr = inject(ChangeDetectorRef);
  private hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focusModal = new NodeFocusModalController(this.hostElement, 'generic-node-focus-placeholder');

  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  @HostBinding('class.selected') get selected() {
    return this.data.selected || this.editorState.isBlockSelected(this.blockId);
  }

  @HostBinding('class.validation-highlighted') get validationHighlighted() {
    return this.editorState.isValidationNodeHighlighted(this.blockId);
  }

  @HostBinding('attr.data-block-id') get hostBlockId() {
    return this.blockId;
  }

  @HostBinding('class.llm-node-readonly') get readonlyClass() {
    return this.isReadonly;
  }

  outputs: { key: string; socket: ClassicPreset.Socket }[] = [];
  inputs: { key: string; socket: ClassicPreset.Socket }[] = [];
  dependantOutput: RenderedSocketPort | null = null;
  dependencyInput: RenderedSocketPort | null = null;
  parameterFields: EditableFieldView[] = [];
  parameterFieldGroups: EditableFieldGroupView[] = [];
  richContentFields: RichContentView[] = [];
  parameterDisplayItems: ParameterDisplayItem[] = [];
  parameterDisplaySections: ParameterDisplaySection[] = [];
  arrayFields: ArrayFieldView[] = [];
  name = 'noName';

  localEditorOpen = false;
  localEditorPath: string | null = null;
  localEditorLabel = '';
  localEditorValue = '';
  localEditorOptions: NodeSettingOption[] = [];
  localEditorLoading = false;
  localEditorHasRetriever = false;
  localEditorType: FieldType = 'string';
  localEditorMaxLength: number | null = null;
  localEditorWidget: 'textarea' | null = null;
  localEditorRows: number | null = null;
  localEditorBindableAsInput = false;
  localEditorUseInput = false;
  localEditorBindableInputName: string | null = null;
  deleteConfirmOpen = false;
  focusOpen = false;
  schemaReady = false;
  private schemaLoading = false;

  get isSchemaLoading() {
    return this.schemaLoading;
  }

  missingRequiredParams: string[] = [];
  private blockSchema: Record<string, any> | null = null;
  private blockDescriptor: BlockType | null = null;
  private editableFieldDefinitions: EditableFieldDefinition[] = [];
  private arrayFieldDefinitions: ArrayFieldDefinition[] = [];
  private schemaRequirements: SchemaRequirements = { required: [], requiredObjects: [], conditional: [] };
  private conditionalRequiredByPath = new Map<string, boolean>();
  private refreshingConditionalRequirements = false;

  /**
   * This template renders inside a node card, which rete.js positions with a
   * CSS `transform` for pan/zoom, so a plain fixed-position backdrop would be
   * confined to the node's box. A native `<dialog>` shown via `showModal()`
   * escapes that via the browser's top layer, same fix as bias-annotations.
   */
  private readonly simpleEditorDialog = viewChild<ElementRef<HTMLDialogElement>>('simpleEditorDialog');

  constructor() {
    effect(() => {
      const descriptorSignal = (this.blocksService as BlocksService & {
        biasAnnotationsDescriptor?: () => { blockProperty?: string } | null
      }).biasAnnotationsDescriptor;
      const property = typeof descriptorSignal === 'function' ? descriptorSignal()?.blockProperty : null;
      if (this.data?.data && typeof property === 'string' && property.length) {
        this.data.data.__biasAnnotationsProperty = property;
      }
    });

    effect(() => {
      const dialog = this.simpleEditorDialog()?.nativeElement;
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
      }
    });
  }

  onSimpleEditorDialogClick(event: MouseEvent) {
    if (event.target === this.simpleEditorDialog()?.nativeElement) {
      this.closeSimpleParamEditor(event);
    }
  }

  ngOnInit() {
    if (this.data?.data) {
      this.data.data.__biasAnnotationsProperty = this.biasAnnotationsProperty;
    }
    this.outputs = [];
    this.inputs = [];
    this.parameterFields = [];
    this.parameterFieldGroups = [];
    this.richContentFields = [];
    this.parameterDisplayItems = [];
    this.parameterDisplaySections = [];
    this.arrayFields = [];

    Object.entries(this.data.outputs).forEach(([key, output]) => {
      const entry = { key, socket: (output as any).socket };
      if (key === FLOW_DEPENDANT_PORT_KEY) {
        this.dependantOutput = entry;
        return;
      }
      this.outputs.push(entry);
    });

    Object.entries(this.data.inputs).forEach(([key, input]) => {
      const entry = { key, socket: (input as any).socket };
      if (key === FLOW_DEPENDENCY_PORT_KEY) {
        this.dependencyInput = entry;
        return;
      }
      this.inputs.push(entry);
    });

    const config = this.ensureBlockConfiguration();

    this.name = toStringOrNull(config['name']) || this.name;

    this.refreshValidationState();
    this.refreshParameterFields();
    this.restorePersistedFocusState();
    void this.loadSchemaContext();
  }

  @HostListener('click')
  onNodeClick() {
    if (!this.shouldRetrySchemaLoad()) return;
    void this.loadSchemaContext();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.focusOpen) {
      this.setFocusOpen(false);
    }
  }

  ngOnDestroy() {
    this.focusModal.close();
  }

  ngAfterViewInit() {
    this.rendered();
  }

  get isReadonly() {
    return this.data?.data?.['__readonly'] === true;
  }

  get nodeIdLabel() {
    return this.blockId ?? 'unknown-id';
  }

  toggleFocus(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.setFocusOpen(!this.focusOpen);
  }

  closeFocus(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.setFocusOpen(false);
  }

  private setFocusOpen(value: boolean) {
    if (this.focusOpen === value) return;
    this.focusOpen = value;
    this.syncPersistedFocusState();
    if (value) this.focusModal.open();
    else this.focusModal.close();
    this.cdr.markForCheck();
  }

  private restorePersistedFocusState() {
    const nodeData = this.data?.data as Record<string, unknown> | undefined;
    if (nodeData?.['__focusOpen'] !== true) return;
    this.setFocusOpen(true);
  }

  private syncPersistedFocusState() {
    const nodeData = this.data?.data as Record<string, unknown> | undefined;
    if (!nodeData) return;
    nodeData['__focusOpen'] = this.focusOpen;
  }

  async openNameEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    this.localEditorPath = 'name';
    this.localEditorLabel = 'Name';
    this.localEditorType = 'string';
    this.localEditorMaxLength = 20;
    this.localEditorValue = this.name ?? '';
    this.localEditorOptions = [];
    this.localEditorLoading = false;
    this.localEditorHasRetriever = false;
    this.localEditorOpen = true;
    this.localEditorWidget = null;
    this.localEditorRows = null;
    this.localEditorBindableAsInput = false;
    this.localEditorUseInput = false;
    this.localEditorBindableInputName = null;
  }

  async openParameterEditor(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const definition = this.editableFieldDefinitions.find((field) => field.path === path);
    if (!definition) return;
    if (!this.isFieldVisible(definition) || !this.isPathEnabled(definition.path)) return;

    this.localEditorPath = definition.path;
    this.localEditorLabel = definition.label;
    this.localEditorType = definition.type;
    this.localEditorMaxLength = null;
    this.localEditorWidget = definition.ui.widget;
    this.localEditorRows = definition.ui.rows ?? null;
    this.localEditorValue = this.valueToEditorString(this.getByPath(this.blockConfiguration ?? {}, definition.path), definition.type);
    this.localEditorOptions = this.resolveSelectableOptions(definition);
    this.localEditorBindableAsInput = definition.ui.bindableAsInput;
    this.localEditorUseInput = this.isBindableFieldUsingInput(definition);
    this.localEditorBindableInputName = definition.ui.inputName;
    this.localEditorLoading = !!definition.retrieverKey && !this.localEditorUseInput;
    this.localEditorHasRetriever = this.localEditorOptions.length > 0 || !!definition.retrieverKey || !!definition.nodeOptionsSource;
    this.localEditorOpen = true;

    if (definition.retrieverKey && !this.localEditorUseInput) {
      const missingDependencies = definition.retrieverDependsOn
        .filter((dep) => {
          const value = this.resolveRetrieverDependencyValue(this.blockConfiguration ?? {}, dep);
          return this.isMissingValue(value);
        })
        .map((dep) => dep.source === 'context' ? pathToLabel(dep.key) : pathToLabel(dep.path));

      const hasMissingFieldDependencies = definition.retrieverDependsOn.some((dep) => {
        if (dep.source !== 'field') return false;
        const value = this.resolveRetrieverDependencyValue(this.blockConfiguration ?? {}, dep);
        return this.isMissingValue(value);
      });

      if (hasMissingFieldDependencies) {
        this.localEditorLoading = false;
        return;
      }

      await this.loadLocalEditorOptions(definition);
    }
  }

  closeSimpleParamEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    this.localEditorOpen = false;
    this.localEditorPath = null;
    this.localEditorLabel = '';
    this.localEditorOptions = [];
    this.localEditorLoading = false;
    this.localEditorHasRetriever = false;
    this.localEditorType = 'string';
    this.localEditorMaxLength = null;
    this.localEditorWidget = null;
    this.localEditorRows = null;
    this.localEditorBindableAsInput = false;
    this.localEditorUseInput = false;
    this.localEditorBindableInputName = null;
  }

  saveSimpleParamEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    if (!this.localEditorPath) return;
    if (!this.canSaveLocalEditor()) return;
    const config = this.ensureBlockConfiguration();

    if (this.localEditorPath === 'name') {
      const nameValue = this.localEditorValue.trim().slice(0, 20);
      config['name'] = nameValue;
      this.name = nameValue || this.name;
    } else {
      const previousValue = this.getByPath(config, this.localEditorPath);
      const parsedValue = this.localEditorUseInput
        ? this.emptyValueForFieldType(this.localEditorType)
        : this.parseEditorValue(this.localEditorValue, this.localEditorType);
      setSchemaValueByPath(config, this.localEditorPath, parsedValue);
      if (!schemaValuesEqual(previousValue, parsedValue)) {
        resetDependentSchemaRetrieverFields(config, this.localEditorPath, this.editableFieldDefinitions);
        if (this.isStructuralField(this.localEditorPath)) {
          this.markBlockForServerRecreate();
        }
      }
    }

    this.pruneInactiveConfiguration(config);
    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
    this.maybeCreateBlockOnServer();
    this.closeSimpleParamEditor();
  }

  async openMainContentEditor(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    if (!this.isPathVisible(path)) return;

    const contentLabel = this.fieldDisplayLabel(path);
    const ui = this.getFieldUiMeta(path);
    const currentValue = String(this.getByPath(this.blockConfiguration ?? {}, path) ?? '');
    await this.openTextareaEditor(path, contentLabel, currentValue, ui);
  }

  async confirmDelete(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;
    if (!this.deleteConfirmOpen) {
      this.deleteConfirmOpen = true;
      return;
    }

    const deleteNode = this.data?.data?.deleteNode;
    if (typeof deleteNode === 'function') {
      await deleteNode();
    }
  }

  cancelDelete(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.deleteConfirmOpen = false;
  }

  async cloneCurrentNode(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const cloneNode = this.data?.data?.cloneNode;
    if (typeof cloneNode === 'function') {
      await cloneNode();
    }
  }

  isHumanNode(): boolean {
    return isHumanInteractiveNode(this.blockDescriptor?.interactionContract);
  }

  isConditionalNode(): boolean {
    return isConditionalByPorts(this.resolvePorts('output'));
  }

  nodeTitle(): string {
    return formatNodeTitle(this.blockType);
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

  hasExecutionDependencyPorts(): boolean {
    return !!this.dependencyInput || !!this.dependantOutput;
  }

  inputDisplayLabel(inputKey: string): string {
    return this.portDisplayLabel('input', inputKey);
  }

  outputDisplayLabel(outputKey: string): string {
    return this.portDisplayLabel('output', outputKey);
  }

  canTogglePortMultiplicity(kind: 'input' | 'output', key: string): boolean {
    const port = this.resolvePorts(kind).find((candidate) => candidate.name === key);
    return !!port && this.portSelectableKinds(port).length > 1;
  }

  portCurrentKindLabel(kind: 'input' | 'output', key: string): string {
    const port = this.resolvePorts(kind).find((candidate) => candidate.name === key);
    return port ? flowValueKindLabel(currentFlowPortValueKind(port)) : 'ANY';
  }

  portCurrentKindValue(kind: 'input' | 'output', key: string): string {
    const port = this.resolvePorts(kind).find((candidate) => candidate.name === key);
    if (!port) return '';

    const current = currentFlowPortValueKind(port);
    const exact = this.portSelectableKinds(port).find((kindOption) =>
      kindOption.type === current.type && kindOption.multiple === current.multiple
    );
    const selected = exact ?? this.portSelectableKinds(port)[0];
    return selected ? this.flowValueKindValue(selected) : '';
  }

  portSelectableKindOptions(kind: 'input' | 'output', key: string): Array<{ value: string; label: string }> {
    const port = this.resolvePorts(kind).find((candidate) => candidate.name === key);
    if (!port) return [];
    return this.portSelectableKinds(port).map((kindOption) => ({
      value: this.flowValueKindValue(kindOption),
      label: flowValueKindLabel(kindOption)
    }));
  }

  onPortKindChange(kind: 'input' | 'output', key: string, nextValue: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const ports = this.resolvePorts(kind);
    const index = ports.findIndex((candidate) => candidate.name === key);
    if (index < 0) return;

    const port = ports[index];
    const nextKind = this.portSelectableKinds(port).find(
      (kindOption) => this.flowValueKindValue(kindOption) === nextValue
    );
    if (!nextKind) return;

    ports[index] = {
      ...port,
      type: nextKind.type,
      multiple: nextKind.multiple
    };

    this.syncPortSocketType(kind, key, nextKind.type);

    this.markFlowDirty();
    this.refreshView();
  }

  hasMainContent(): boolean {
    return this.richContentFields.length > 0;
  }

  hasOrderedParameterItems(): boolean {
    return this.parameterDisplaySections.length > 0;
  }

  formatDynamicInputToken(token: string): string {
    const match = token.match(/^\$\{\{\s*([^}]+?)\s*\}\}$/);
    return match ? match[1] : token;
  }

  isCreatingOnServer(): boolean {
    return this.data?.data?.['__isCreatingOnServer'] === true;
  }

  hasUpdateBlockError(): boolean {
    return typeof this.data?.data?.['__updateBlockError'] === 'string'
      && this.data.data['__updateBlockError'].length > 0;
  }

  updateBlockErrorMessage(): string | null {
    const error = this.data?.data?.['__updateBlockError'];
    return typeof error === 'string' && error.length > 0 ? error : null;
  }

  private get blockConfiguration(): Record<string, any> | null {
    return this.data?.data?.specificConfiguration ?? null;
  }

  private get blockType(): string | null {
    const typeName = this.data?.data?.typeName;
    return typeof typeName === 'string' && typeName.length > 0 ? typeName : null;
  }

  get blockId(): string | null {
    const blockId = this.data?.data?.id;
    return typeof blockId === 'string' && blockId.length > 0 ? blockId : null;
  }

  get biasAnnotations(): BiasAnnotation[] {
    const nodeData = this.data?.data as Record<string, unknown> | undefined;
    const value = nodeData?.[this.biasAnnotationsProperty];
    return Array.isArray(value) ? value as BiasAnnotation[] : [];
  }

  get biasAnnotationBadge(): { count: number; hasExecutableProbe: boolean; maxSeverityLabel: string | null } | null {
    const annotations = this.biasAnnotations;
    if (!annotations.length) return null;
    return {
      count: annotations.length,
      hasExecutableProbe: annotations.some((annotation) => isProbeExecutable(annotation.behavioralProbe)),
      maxSeverityLabel: this.mostSevereBiasLabel(annotations)
    };
  }

  get biasBlock(): FlowBlock | null {
    const nodeData = this.data?.data as Record<string, unknown> | undefined;
    const blockId = this.blockId;
    const typeName = this.blockType;
    if (!nodeData || !blockId || !typeName) return null;
    return {
      id: blockId,
      name: this.name,
      position: nodeData['position'] as { x: number; y: number } | undefined,
      inputs: this.resolvePorts('input').map((port) => ({ ...port })),
      outputs: this.resolvePorts('output').map((port) => ({ ...port })),
      specificConfiguration: this.blockConfiguration ?? {},
      typeName,
      nodeFamily: 'block',
      biasAnnotations: this.biasAnnotations
    };
  }

  private get biasAnnotationsProperty(): string {
    const descriptorSignal = (this.blocksService as BlocksService & {
      biasAnnotationsDescriptor?: () => { blockProperty?: string } | null
    }).biasAnnotationsDescriptor;
    const property = typeof descriptorSignal === 'function' ? descriptorSignal()?.blockProperty : null;
    return typeof property === 'string' && property.length ? property : 'biasAnnotations';
  }

  private mostSevereBiasLabel(annotations: BiasAnnotation[]): string | null {
    const descriptorSignal = (this.blocksService as BlocksService & {
      biasAnnotationsDescriptor?: () => BiasAnnotationsDescriptor | null
    }).biasAnnotationsDescriptor;
    const severityOptions = descriptorSignal?.()?.options?.['severity'] ?? [];
    const rankByValue = new Map(severityOptions.map((option, index) => [option.value, index]));

    let mostSevereValue: unknown = undefined;
    let mostSevereRank = -1;
    for (const annotation of annotations) {
      const value = annotation.severity;
      const rank = typeof value === 'string' && rankByValue.has(value) ? rankByValue.get(value)! : -1;
      if (mostSevereValue === undefined || rank > mostSevereRank) {
        mostSevereValue = value;
        mostSevereRank = rank;
      }
    }

    if (mostSevereValue == null) return null;
    return severityOptions.find((option) => option.value === mostSevereValue)?.label
      ?? (typeof mostSevereValue === 'string' ? mostSevereValue : null);
  }

  private ensureBlockConfiguration(): Record<string, any> {
    if (!this.data?.data) {
      this.data.data = {};
    }
    if (!this.data.data.specificConfiguration) {
      this.data.data.specificConfiguration = {};
    }
    return this.data.data.specificConfiguration;
  }

  private markFlowDirty() {
    const flow = this.editorState.currentFlow();
    if (!flow) return;
    this.editorState.updateData(this.cloneCurrentFlowWithNodeChanges(flow.data));
  }

  updateBiasAnnotations(annotations: BiasAnnotation[]) {
    if (this.isReadonly || !this.data?.data) return;
    this.data.data[this.biasAnnotationsProperty] = this.cloneFlowData(annotations);
    this.data.data.__biasAnnotationsProperty = this.biasAnnotationsProperty;
    this.markFlowDirty();
    this.refreshView();
  }

  private async loadSchemaContext() {
    if (this.schemaLoading) return;
    const type = this.blockType;
    if (!type) {
      this.schemaReady = true;
      return;
    }

    this.schemaLoading = true;
    this.schemaReady = false;
    try {
      const blockType = this.blocksService.peekBlockType(type) ?? await this.blocksService.getBlockType(type);
      this.blockDescriptor = blockType ?? null;
      this.blockSchema = (blockType?.schema ?? null) as Record<string, any> | null;
      this.schemaRequirements = extractSchemaRequirements(this.blockSchema);
      this.editableFieldDefinitions = this.buildEditableFieldDefinitions(this.blockSchema);
      this.arrayFieldDefinitions = this.buildArrayFieldDefinitions(this.blockSchema);
      this.pruneInactiveConfiguration(this.ensureBlockConfiguration());

      await this.refreshConditionalRequirements();
      this.refreshParameterFields();
      this.refreshValidationState();
      this.maybeCreateBlockOnServer();
    } finally {
      this.schemaLoading = false;
      this.schemaReady = true;
      queueMicrotask(() => {
        try {
          this.cdr.detectChanges();
        } catch {
          // Node may have been removed while schema was loading.
        }
      });
    }
  }

  private shouldRetrySchemaLoad(): boolean {
    if (this.schemaLoading) return false;
    if (!this.blockType) return false;
    return !this.blockSchema || (!this.editableFieldDefinitions.length && !this.arrayFieldDefinitions.length);
  }

  private async openTextareaEditor(
    path: string,
    label: string,
    initialValue: string,
    ui: { placeholder?: string; tip?: string; rows?: number }
  ) {
    const result = await this.settingsDialog.open({
      title: `${label} for "${this.name}"`,
      fields: [
        {
          key: path,
          label,
          type: 'textarea',
          rows: ui.rows ?? 12,
          placeholder: ui.placeholder ?? '',
          tip: ui.tip
        }
      ],
      initial: { [path]: initialValue }
    });
    if (!result) return;

    const config = this.ensureBlockConfiguration();
    const nextValue = String(result[path] ?? '');
    const previousValue = this.getByPath(config, path);
    setSchemaValueByPath(config, path, nextValue);
    if (!schemaValuesEqual(previousValue, nextValue)) {
      resetDependentSchemaRetrieverFields(config, path, this.editableFieldDefinitions);
      if (this.isStructuralField(path)) {
        this.markBlockForServerRecreate();
      }
    }
    this.pruneInactiveConfiguration(config);
    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
    this.maybeCreateBlockOnServer();
  }

  private buildEditableFieldDefinitions(schema: Record<string, any> | null): EditableFieldDefinition[] {
    return buildSchemaEditableFieldDefinitions(schema, {
      shouldSkip: ({ key, schema: childResolved }) =>
        childResolved?.['type'] === 'array' || key === 'type' || key === 'name' || key.startsWith('__')
    });
  }

  private buildArrayFieldDefinitions(schema: Record<string, any> | null): ArrayFieldDefinition[] {
    return collectSchemaLeafFields(schema, ({ key, path, schema: childResolved, ui }) => {
      if (childResolved?.['type'] !== 'array') return null;
      if (key === 'type' || key === 'name' || key.startsWith('__')) return null;

      return {
        path,
        label: schemaFieldLabel(path, childResolved),
        itemSchema: this.resolveArrayItemSchema(childResolved, schema ?? {}),
        uniqueBy: typeof childResolved?.['x-ui-unique-by'] === 'string' && String(childResolved['x-ui-unique-by']).trim().length > 0
          ? String(childResolved['x-ui-unique-by']).trim()
          : null,
        ui: {
          structural: ui.structural,
          visibleWhen: ui.visibleWhen,
          enabledWhen: ui.enabledWhen,
          group: ui.group
        }
      };
    }, {
      includeArrays: true
    });
  }

  private isStructuralField(path: string): boolean {
    return getSchemaPathUiMeta(this.blockSchema, path).structural;
  }

  private resolveFieldSchema(path: string): Record<string, any> | null {
    return resolveSchemaPath(this.blockSchema, path);
  }

  private toFieldType(type: unknown): FieldType {
    if (type && typeof type === 'object' && !Array.isArray(type)) {
      return schemaFieldTypeFromSchema(type as Record<string, any>);
    }
    if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') {
      return type;
    }
    return 'unknown';
  }

  private toEnumOptions(schema: Record<string, any> | null | undefined): string[] {
    return schemaEnumOptions(schema);
  }

  private toNodeOptionsSource(schema: Record<string, any> | null | undefined): NodeOptionsSource | null {
    return schemaNodeOptionsSource(schema);
  }

  private portDisplayLabel(kind: 'input' | 'output', key: string): string {
    const ports = this.resolvePorts(kind);
    const port = ports.find((candidate) => candidate.name === key);
    return port?.name ?? key;
  }

  private portValueKinds(port: FlowPort) {
    return normalizeFlowPortValueKinds(port);
  }

  private portSelectableKinds(port: FlowPort): FlowValueKind[] {
    const expanded = new Map<string, FlowValueKind>();

    for (const kind of this.portValueKinds(port)) {
      const type = String(kind.type ?? 'ANY').toUpperCase();
      if (type === 'ANY') {
        for (const concreteType of ['TEXT', 'FILE']) {
          const concreteKind = { type: concreteType, multiple: Boolean(kind.multiple) };
          expanded.set(this.flowValueKindValue(concreteKind), concreteKind);
        }
        continue;
      }

      expanded.set(this.flowValueKindValue(kind), kind);
    }

    return Array.from(expanded.values());
  }

  private resolvePorts(kind: 'input' | 'output'): FlowPort[] {
    const ports = this.data?.data?.[kind === 'input' ? 'inputs' : 'outputs'];
    return Array.isArray(ports) ? ports as FlowPort[] : [];
  }

  private flowValueKindValue(kind: FlowValueKind): string {
    return `${String(kind.type ?? 'ANY').toUpperCase()}::${kind.multiple ? 'multi' : 'single'}`;
  }

  private isBindableFieldUsingInput(definition: EditableFieldDefinition): boolean {
    if (!definition.ui.bindableAsInput) return false;

    const value = this.getByPath(this.blockConfiguration ?? {}, definition.path);
    if (!this.isMissingValue(value)) return false;

    const actualInputName = definition.ui.inputName;
    if (!actualInputName) return true;

    return this.resolvePorts('input').some((port) => port.name === actualInputName);
  }

  private fieldDisplayValue(definition: EditableFieldDefinition, value: unknown): string {
    if (this.isBindableFieldUsingInput(definition)) {
      const actualPort = this.resolvePorts('input').find((port) => port.name === definition.ui.inputName);
      const fallbackType = definition.ui.inputType ?? definition.type.toUpperCase();
      const fallbackMultiple = Boolean(definition.ui.inputMultiple);
      const kindLabel = actualPort
        ? flowValueKindLabel(currentFlowPortValueKind(actualPort))
        : flowValueKindLabel({ type: fallbackType, multiple: fallbackMultiple });
      const inputName = definition.ui.inputName ?? definition.label;
      return `Provided by input ${inputName} (${kindLabel})`;
    }

    return valueToDisplayString(value);
  }

  canSaveLocalEditor(): boolean {
    if (this.localEditorLoading) return false;
    if (!this.localEditorBindableAsInput || this.localEditorUseInput) return true;
    if (this.localEditorType === 'boolean') return true;
    return this.localEditorValue.trim().length > 0;
  }

  private emptyValueForFieldType(type: FieldType): unknown {
    if (type === 'number' || type === 'integer' || type === 'boolean') return null;
    return '';
  }

  private syncPortSocketType(kind: 'input' | 'output', key: string, type: string) {
    const socketHost = this.data?.[kind === 'input' ? 'inputs' : 'outputs']?.[key];
    if (!socketHost) return;
    socketHost.socket = new ClassicPreset.Socket(type);
  }

  async onLocalEditorSourceModeChange(nextMode: string) {
    this.localEditorUseInput = nextMode === 'input';
    if (this.localEditorUseInput || !this.localEditorPath) {
      this.localEditorLoading = false;
      return;
    }

    const definition = this.editableFieldDefinitions.find((field) => field.path === this.localEditorPath);
    if (!definition?.retrieverKey || this.localEditorOptions.length > 0) return;

    this.localEditorLoading = true;
    await this.loadLocalEditorOptions(definition);
  }

  private async loadLocalEditorOptions(definition: EditableFieldDefinition) {
    const blockType = definition.retrieverBlockType ?? this.blockType;
    if (!blockType || !definition.retrieverKey) {
      this.localEditorLoading = false;
      return;
    }

    const context = this.buildRetrieverContext(
      this.blockConfiguration ?? {},
      definition.retrieverDependsOn
    );

    try {
      this.localEditorOptions = await this.fetchRetrieverOptions(
        blockType,
        definition.retrieverKey,
        definition.retrieverUrl,
        definition.retrieverStructuredData,
        context
      );
    } catch {
      this.localEditorOptions = [];
    } finally {
      this.localEditorLoading = false;
    }
  }

  async openFieldPreview(field: EditableFieldView, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!field.expandable) return;
    await this.openReadonlyTextDialog(field.label, field.value);
  }

  async openMainContentPreview(field: RichContentView, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!field.expandable) return;
    await this.openReadonlyTextDialog(field.label, field.rawValue);
  }

  private resolveSelectableOptions(definition: EditableFieldDefinition): NodeSettingOption[] {
    if (definition.nodeOptionsSource) {
      return this.resolveNodeOptions(definition.nodeOptionsSource);
    }
    return definition.enumOptions.map((option) => ({ label: option, value: option }));
  }

  private resolveNodeOptions(source: NodeOptionsSource): NodeSettingOption[] {
    const items = this.resolvePorts(source.collection === 'inputs' ? 'input' : 'output');
    return items
      .map((item) => {
        const record = item as unknown as Record<string, unknown>;
        const value = record[source.valueField];
        const label = record[source.labelField];
        if (typeof value !== 'string' || typeof label !== 'string' || value.trim().length === 0 || label.trim().length === 0) {
          return null;
        }
        return {
          label,
          value
        } satisfies NodeSettingOption;
      })
      .filter((option): option is NodeSettingOption => option != null);
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

  private refreshParameterFields() {
    const config = this.blockConfiguration ?? {};
    const richContentPaths = new Set(this.richContentPaths());
    this.parameterDisplayItems = [];
    this.parameterDisplaySections = [];

    this.richContentFields = this.richContentPaths()
      .filter((path) => this.isPathVisible(path))
      .map((path) => {
        const rawValue = String(this.getByPath(config, path) ?? '');
        return {
          path,
          label: this.fieldDisplayLabel(path),
          rawValue,
          expandable: isLongTextValue(rawValue),
          parts: this.toRichContentParts(path)
        };
      });

    this.arrayFields = this.arrayFieldDefinitions
      .filter((definition) => this.isPathVisible(definition.path))
      .map((definition) => ({
        path: definition.path,
        label: definition.label,
        items: this.toArrayFieldItems(definition, this.getByPath(config, definition.path))
      }));

    if (this.editableFieldDefinitions.length) {
      const groupedFields = buildSchemaFieldViewModel({
        definitions: this.editableFieldDefinitions,
        config,
        richContentPaths: this.richContentPaths(),
        isPathVisible: (path, nextConfig) => this.isPathVisible(path, nextConfig),
        isPathEnabled: (path, nextConfig) => this.isPathEnabled(path, nextConfig),
        getFieldValue: (definition, nextConfig) => this.fieldDisplayValue(definition, this.getByPath(nextConfig, definition.path)),
        isFieldWide: (definition) => this.shouldRenderWideField(definition.label, definition.ui.widget === 'textarea'),
        getRichContentParts: (path, _nextConfig) => this.toRichContentParts(path),
        resolveGroupLabel: (path) => getSchemaPathUiMeta(this.blockSchema, path).group ?? parentPath(path),
        groupRichContent: false
      });
      const allFields = [
        ...groupedFields.parameterFields,
        ...groupedFields.parameterFieldGroups.flatMap((group) => group.fields)
      ];
      const allRichContentFields = [
        ...groupedFields.richContentFields,
        ...groupedFields.parameterFieldGroups.flatMap((group) => group.richContentFields)
      ];
      this.parameterFields = groupedFields.parameterFields;
      this.richContentFields = groupedFields.richContentFields;
      const ordered = buildOrderedSchemaDisplay({
        definitions: this.orderedDisplayPaths(),
        fields: allFields,
        richContentFields: allRichContentFields,
        arrayFields: this.arrayFields,
        resolveGroupLabel: (path) => getSchemaPathUiMeta(this.blockSchema, path).group ?? parentPath(path)
      });
      this.parameterDisplayItems = ordered.rootItems;
      this.parameterFieldGroups = ordered.groups;
      this.parameterDisplaySections = ordered.sections;
      this.refreshView();
      return;
    }

    const fallbackFields = flattenPrimitiveValues(config)
      .filter((entry) => entry.path !== 'name' && entry.path !== 'type' && !richContentPaths.has(entry.path))
      .filter((entry) => this.isPathVisible(entry.path))
      .map((entry) => ({
        path: entry.path,
        label: this.fieldDisplayLabel(entry.path),
        value: valueToDisplayString(entry.value),
        wide: this.shouldRenderWideField(this.fieldDisplayLabel(entry.path), false),
        expandable: isLongTextValue(valueToDisplayString(entry.value)),
        enabled: this.isPathEnabled(entry.path),
        type: (typeof entry.value === 'boolean' ? 'boolean' : 'unknown') as FieldType,
        booleanValue: entry.value === true
      }));

    const groupedFallback = groupSchemaFields({
      fields: fallbackFields,
      resolveGroupLabel: (path) => parentPath(path),
      resolveLegend: (groupLabel) => this.fieldDisplayLabel(groupLabel)
    });

    this.parameterFields = groupedFallback.rootFields;
    this.parameterFieldGroups = groupedFallback.groups.map((group) => ({
      key: group.key,
        legend: group.legend,
        items: group.fields.map((field) => ({
          path: field.path,
          field,
          richContentField: null,
          arrayField: null
        }))
      }));
    this.parameterDisplayItems = groupedFallback.rootFields.map((field) => ({
      path: field.path,
      field,
      richContentField: null,
      arrayField: null
    }));
    this.parameterDisplaySections = [
      ...groupedFallback.groups.map((group) => ({
        key: group.key,
        group: {
          key: group.key,
          legend: group.legend,
          items: group.fields.map((field) => ({
            path: field.path,
            field,
            richContentField: null,
            arrayField: null
          }))
        },
        item: null
      })),
      ...groupedFallback.rootFields.map((field) => ({
        key: `item:${field.path}`,
        group: null,
        item: {
          path: field.path,
          field,
          richContentField: null,
          arrayField: null
        }
      }))
    ];

    this.refreshView();
  }

  private orderedDisplayPaths(): Array<{ path: string }> {
    return collectSchemaLeafFields(this.blockSchema, ({ key, path }) => {
      if (key === 'type' || key === 'name' || key.startsWith('__')) return null;
      return { path };
    }, {
      includeArrays: true
    });
  }

  async addArrayItem(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;
    await this.openArrayItemEditor(path, null);
  }

  async editArrayItem(path: string, index: number, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;
    await this.openArrayItemEditor(path, index);
  }

  removeArrayItem(path: string, index: number, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const config = this.ensureBlockConfiguration();
    const current = this.getByPath(config, path);
    const items = Array.isArray(current) ? [...current] : [];
    if (index < 0 || index >= items.length) return;

    items.splice(index, 1);
    setSchemaValueByPath(config, path, items);
    if (this.isStructuralField(path)) {
      this.markBlockForServerRecreate();
    }
    this.pruneInactiveConfiguration(config);
    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
    this.maybeCreateBlockOnServer();
  }

  private async openArrayItemEditor(path: string, index: number | null) {
    const definition = this.arrayFieldDefinitions.find((field) => field.path === path);
    if (!definition || !this.isPathVisible(path)) return;

    const config = this.ensureBlockConfiguration();
    const current = this.getByPath(config, path);
    const items = Array.isArray(current) ? [...current] : [];
    const currentItem = index == null ? this.createEmptyArrayItem(definition.itemSchema) : this.cloneFlowData(items[index] ?? {});
    const dialog = await this.buildArrayItemDialog(definition, currentItem, index);
    if (!dialog) return;

    const result = await this.settingsDialog.open(dialog);
    if (!result) return;

    const nextItem = this.parseArrayItemDialogResult(definition, result, currentItem);
    const duplicateError = this.validateUniqueArrayItem(definition, items, nextItem, index);
    if (duplicateError) {
      window.alert(duplicateError);
      return;
    }

    if (index == null) {
      items.push(nextItem);
    } else {
      items[index] = nextItem;
    }

    setSchemaValueByPath(config, path, items);
    if (this.isStructuralField(path)) {
      this.markBlockForServerRecreate();
    }
    this.pruneInactiveConfiguration(config);
    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
    this.maybeCreateBlockOnServer();
  }

  private async buildArrayItemDialog(
    definition: ArrayFieldDefinition,
    item: Record<string, unknown>,
    index: number | null
  ): Promise<NodeSettingsDialogInput | null> {
    const itemSchema = definition.itemSchema;
    const properties = itemSchema?.['properties'] as Record<string, any> | undefined;
    const schemaRoot = this.blockSchema ?? itemSchema ?? {};

    if (!properties) {
      return {
        title: `${index == null ? 'Add' : 'Edit'} ${definition.label} item`,
        fields: [
          {
            key: '__raw',
            label: 'Item JSON',
            type: 'textarea' as const,
            rows: 10
          }
        ],
        initial: {
          __raw: JSON.stringify(item ?? {}, null, 2)
        }
      };
    }

    const fields: NodeSettingField[] = [];
    const initial: Record<string, string | boolean> = {};

    for (const { key, schema: propertySchema } of orderedSchemaPropertyEntries(itemSchema, schemaRoot)) {
      if (!propertySchema) continue;
      if (shouldSkipSchemaField(key, propertySchema)) continue;

      const fieldUi = this.toFieldUiMeta(propertySchema);
      const visible = fieldUi.visibleWhen.every((rule) =>
        evaluateUiConditionRule(rule, item, (fieldPath) => resolveSchemaPath(itemSchema, fieldPath))
      );
      if (!visible) continue;

      if (this.hasDynamicSchema(propertySchema)) {
        const dynamicFields = await this.buildDynamicSchemaFields(key, propertySchema, item);
        fields.push(...dynamicFields.fields);
        Object.assign(initial, dynamicFields.initial);
        continue;
      }

      const label = schemaFieldLabel(key, propertySchema);
      const currentValue = item[key];
      const options = await this.loadNodeSettingOptions(propertySchema, item, '');
      const isObjectLike = propertySchema?.['type'] === 'object';
      const fieldType =
        options ? 'select' :
          propertySchema?.['type'] === 'boolean' ? 'checkbox' :
            propertySchema?.['x-ui-widget'] === 'textarea' || isObjectLike ? 'textarea' :
              'text';

      fields.push({
        key,
        label,
        type: fieldType,
        rows: fieldType === 'textarea' ? 8 : undefined,
        options,
        placeholder: typeof propertySchema?.['x-ui-placeholder'] === 'string' ? String(propertySchema['x-ui-placeholder']) : undefined,
        tip: schemaFieldDescription(propertySchema) ?? undefined,
        readonly: !fieldUi.enabledWhen.every((rule) =>
          evaluateUiConditionRule(rule, item, (fieldPath) => resolveSchemaPath(itemSchema, fieldPath))
        )
      });

      if (fieldType === 'checkbox') {
        initial[key] = currentValue === true;
      } else if (fieldType === 'textarea' && isObjectLike) {
        initial[key] = JSON.stringify(currentValue ?? {}, null, 2);
      } else {
        initial[key] = currentValue == null ? '' : String(currentValue);
      }
    }

    return {
      title: `${index == null ? 'Add' : 'Edit'} ${definition.label} item`,
      fields,
      initial,
      onValuesChange: async (draft) => {
        const draftItem = this.parseArrayItemDialogResult(definition, draft, item);
        const nextDialog = await this.buildArrayItemDialog(definition, draftItem, index);
        if (!nextDialog) return null;
        return {
          fields: nextDialog.fields,
          initial: nextDialog.initial
        };
      }
    };
  }

  private parseArrayItemDialogResult(
    definition: ArrayFieldDefinition,
    result: Record<string, string | boolean>,
    previousItem: Record<string, unknown>
  ) {
    const itemSchema = definition.itemSchema;
    const properties = itemSchema?.['properties'] as Record<string, any> | undefined;
    const schemaRoot = this.blockSchema ?? itemSchema ?? {};
    if (!properties) {
      try {
        return JSON.parse(String(result['__raw'] ?? '{}')) as Record<string, unknown>;
      } catch {
        return previousItem;
      }
    }

    const nextItem: Record<string, unknown> = {};

    for (const { key, schema: propertySchema } of orderedSchemaPropertyEntries(itemSchema, schemaRoot)) {
      if (!propertySchema) continue;
      if (shouldSkipSchemaField(key, propertySchema)) continue;

      const fieldUi = this.toFieldUiMeta(propertySchema);
      const visible = fieldUi.visibleWhen.every((rule) =>
        evaluateUiConditionRule(rule, result, (fieldPath) => resolveSchemaPath(itemSchema, fieldPath))
      );
      if (!visible) continue;

      if (this.hasDynamicSchema(propertySchema)) {
        const dynamicValue = this.extractNestedDialogValues(result, key);
        nextItem[key] = Object.keys(dynamicValue).length ? dynamicValue : (previousItem[key] ?? {});
        continue;
      }

      const rawValue = result[key];
      const isObjectLike = propertySchema?.['type'] === 'object';

      if (propertySchema?.['type'] === 'boolean') {
        nextItem[key] = rawValue === true;
        continue;
      }

      if (isObjectLike) {
        try {
          nextItem[key] = JSON.parse(String(rawValue ?? '{}'));
        } catch {
          nextItem[key] = previousItem[key] ?? {};
        }
        continue;
      }

      if (propertySchema?.['type'] === 'number' || propertySchema?.['type'] === 'integer') {
        const numeric = Number(rawValue ?? 0);
        nextItem[key] = Number.isFinite(numeric)
          ? (propertySchema['type'] === 'integer' ? Math.trunc(numeric) : numeric)
          : 0;
        continue;
      }

      nextItem[key] = String(rawValue ?? '');
    }

    return nextItem;
  }

  private createEmptyArrayItem(itemSchema: Record<string, any> | null) {
    const properties = itemSchema?.['properties'] as Record<string, any> | undefined;
    const schemaRoot = this.blockSchema ?? itemSchema ?? {};
    if (!properties) return {};

    const item: Record<string, unknown> = {};
    for (const { key, schema: propertySchema } of orderedSchemaPropertyEntries(itemSchema, schemaRoot)) {
      if (!propertySchema) continue;
      if (shouldSkipSchemaField(key, propertySchema)) continue;
      if (Object.prototype.hasOwnProperty.call(propertySchema ?? {}, 'default')) {
        item[key] = propertySchema['default'];
        continue;
      }
      if (propertySchema?.['type'] === 'boolean') {
        item[key] = false;
      } else if (propertySchema?.['type'] === 'number' || propertySchema?.['type'] === 'integer') {
        item[key] = 0;
      } else if (propertySchema?.['type'] === 'object' || this.hasDynamicSchema(propertySchema)) {
        item[key] = {};
      } else {
        item[key] = '';
      }
    }
    return item;
  }

  private resolveArrayItemSchema(node: Record<string, any> | null | undefined, root: Record<string, any>) {
    const items = node?.['items'];
    if (!items || typeof items !== 'object') return null;
    const resolved = resolveSchemaRef(items as Record<string, any>, root);
    return resolved && typeof resolved === 'object' ? resolved as Record<string, any> : null;
  }

  private hasDynamicSchema(schema: Record<string, any> | null | undefined) {
    return typeof schema?.['x-ui-schema-url'] === 'string' && String(schema['x-ui-schema-url']).trim().length > 0;
  }

  private async buildDynamicSchemaFields(
    baseKey: string,
    propertySchema: Record<string, any>,
    item: Record<string, unknown>
  ): Promise<{ fields: NodeSettingField[]; initial: Record<string, string | boolean> }> {
    const schemaUrl = String(propertySchema['x-ui-schema-url'] ?? '');
    const dependsOn = Array.isArray(propertySchema['x-ui-schema-depends-on'])
      ? (propertySchema['x-ui-schema-depends-on'] as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    const context: Record<string, string> = {};
    for (const key of dependsOn) {
      const value = item[key];
      if (value != null && String(value).trim().length > 0) {
        context[key] = String(value);
      }
    }

    if (dependsOn.some((key) => !context[key])) {
      return {
        fields: [{
          key: `${baseKey}.__hint`,
          label: schemaFieldLabel(baseKey, propertySchema),
          type: 'display',
          readonly: true
        }],
        initial: {
          [`${baseKey}.__hint`]: `Select ${dependsOn.map((key) => pathToLabel(key)).join(', ')} first`
        }
      };
    }

    const dynamicSchema = await firstValueFrom(this.fieldRetriever.retrieveSchema(schemaUrl, context));
    const resolvedSchema = dynamicSchema && typeof dynamicSchema === 'object'
      ? dynamicSchema as Record<string, any>
      : null;

    if (!resolvedSchema) {
      return {
        fields: [{
          key: `${baseKey}.__hint`,
          label: schemaFieldLabel(baseKey, propertySchema),
          type: 'display',
          readonly: true
        }],
        initial: {
          [`${baseKey}.__hint`]: 'No dynamic schema available'
        }
      };
    }

    return this.buildDialogFieldsFromSchema(baseKey, schemaFieldLabel(baseKey, propertySchema), resolvedSchema, item[baseKey]);
  }

  private async buildDialogFieldsFromSchema(
    keyPrefix: string,
    labelPrefix: string,
    schema: Record<string, any>,
    currentValue: unknown
  ): Promise<{ fields: NodeSettingField[]; initial: Record<string, string | boolean> }> {
    const fields: NodeSettingField[] = [];
    const initial: Record<string, string | boolean> = {};
    const currentRecord =
      currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
        ? currentValue as Record<string, unknown>
        : {};

    const walk = async (
      node: Record<string, any>,
      pathPrefix: string,
      titlePrefix: string,
      inheritedUi?: { visibleWhen: UiConditionRule[]; enabledWhen: UiConditionRule[]; group: string | null }
    ) => {
      const resolved = resolveSchemaRef(node, schema);
      const properties = orderedSchemaPropertyEntries(resolved, schema);
      if (!properties.length) return;

      for (const { key: childKey, schema: childSchema } of properties) {
        if (!childSchema) continue;
        if (shouldSkipSchemaField(childKey, childSchema)) continue;

        const childUi = this.toFieldUiMeta(childSchema, inheritedUi);
        const fieldRelativePath = pathPrefix === keyPrefix
          ? childKey
          : `${pathPrefix.slice(`${keyPrefix}.`.length)}.${childKey}`;
        const visible = childUi.visibleWhen.every((rule) =>
          evaluateUiConditionRule(rule, currentRecord, (fieldPath) => resolveSchemaPath(schema, fieldPath))
        );
        if (!visible) continue;

        const nextPath = `${pathPrefix}.${childKey}`;
        const nextLabel = `${titlePrefix} ${schemaFieldLabel(childKey, childSchema)}`;
        const currentNestedValue = getValueByPath(currentRecord, fieldRelativePath);

        const hasChildren = !!childSchema?.['properties'] || childSchema?.['type'] === 'object';
        if (hasChildren) {
          await walk(childSchema as Record<string, any>, nextPath, nextLabel, {
            visibleWhen: childUi.visibleWhen,
            enabledWhen: childUi.enabledWhen,
            group: childUi.group
          });
          continue;
        }

        const options = await this.loadNodeSettingOptions(
          childSchema,
          currentRecord,
          pathPrefix === keyPrefix ? '' : pathPrefix.slice(`${keyPrefix}.`.length)
        );

        const fieldType =
          options ? 'select' :
            childSchema?.['type'] === 'boolean' ? 'checkbox' :
              childSchema?.['x-ui-widget'] === 'textarea' ? 'textarea' :
                'text';

        fields.push({
          key: nextPath,
          label: nextLabel,
          type: fieldType,
          rows: fieldType === 'textarea' ? 8 : undefined,
          options,
          placeholder: typeof childSchema?.['x-ui-placeholder'] === 'string' ? String(childSchema['x-ui-placeholder']) : undefined,
          tip: schemaFieldDescription(childSchema) ?? undefined,
          readonly: !childUi.enabledWhen.every((rule) =>
            evaluateUiConditionRule(rule, currentRecord, (fieldPath) => resolveSchemaPath(schema, fieldPath))
          )
        });

        if (fieldType === 'checkbox') {
          initial[nextPath] = currentNestedValue === true;
        } else {
          initial[nextPath] = currentNestedValue == null ? '' : String(currentNestedValue);
        }
      }
    };

    await walk(schema, keyPrefix, labelPrefix);
    return { fields, initial };
  }

  private extractNestedDialogValues(result: Record<string, string | boolean>, keyPrefix: string) {
    const nested: Record<string, unknown> = {};
    const prefix = `${keyPrefix}.`;

    for (const [key, value] of Object.entries(result)) {
      if (!key.startsWith(prefix)) continue;
      const nestedPath = key.slice(prefix.length);
      setSchemaValueByPath(nested, nestedPath, value);
    }

    return nested;
  }

  private fieldDisplayLabel(path: string): string {
    return schemaFieldLabel(path, this.resolveFieldSchema(path));
  }

  private async loadNodeSettingOptions(
    propertySchema: Record<string, any>,
    item: Record<string, unknown>,
    pathPrefix: string
  ): Promise<NodeSettingOption[] | undefined> {
    const enumOptions = this.toEnumOptions(propertySchema);
    if (enumOptions.length) {
      return enumOptions.map((value) => ({ label: value, value }));
    }

    const retrieverMeta = schemaRetrieverMeta(propertySchema, pathPrefix);
    const retrieverKey = retrieverMeta.retrieverKey;
    const retrieverBlockType = retrieverMeta.retrieverBlockType;
    if (!retrieverKey || !retrieverBlockType) return undefined;

    try {
      return await this.fetchRetrieverOptions(
        retrieverBlockType,
        retrieverKey,
        retrieverMeta.retrieverUrl,
        retrieverMeta.retrieverStructuredData,
        this.buildRetrieverContext(item as Record<string, any>, retrieverMeta.retrieverDependsOn)
      );
    } catch {
      return [];
    }
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
      if (this.isMissingValue(value)) continue;
      if (typeof value === 'string') {
        summaryParts.push(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        summaryParts.push(String(value));
      }
      if (summaryParts.length === 2) break;
    }

    return summaryParts.length ? summaryParts.join(' · ') : `Item ${index + 1}`;
  }

  private validateUniqueArrayItem(
    definition: ArrayFieldDefinition,
    items: unknown[],
    nextItem: Record<string, unknown>,
    currentIndex: number | null
  ): string | null {
    const violation = validateUniqueByConstraint(
      items,
      nextItem,
      definition.uniqueBy,
      currentIndex,
      (value) => this.isMissingValue(value),
      (left, right) => schemaValuesEqual(left, right)
    );
    if (!violation) return null;

    const uniqueLabel = pathToLabel(violation.path);
    const fieldLabel = definition.label;
    return `${fieldLabel} requires a unique ${uniqueLabel}. "${String(violation.value)}" is already used.`;
  }

  private valueToEditorString(value: unknown, type: FieldType): string {
    if (type === 'boolean') {
      return value === true ? 'true' : 'false';
    }
    if (value == null) return '';
    if (typeof value === 'string') return value;
    return String(value);
  }

  private parseEditorValue(value: string, type: FieldType): unknown {
    const trimmed = value.trim();

    if (type === 'boolean') {
      return trimmed === 'true';
    }

    if (type === 'number' || type === 'integer') {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) return 0;
      return type === 'integer' ? Math.trunc(numeric) : numeric;
    }

    return value;
  }

  private pruneInactiveConfiguration(config: Record<string, any>) {
    pruneInactiveSchemaConfiguration(config, [
      ...this.editableFieldDefinitions.map((field) => field.path),
      ...this.arrayFieldDefinitions.map((field) => field.path)
    ], (path, nextConfig) => this.isPathVisible(path, nextConfig) && this.isPathEnabled(path, nextConfig));
  }

  private richContentPaths(): string[] {
    const textareaPaths = this.editableFieldDefinitions
      .filter((field) => field.ui.widget === 'textarea')
      .map((field) => field.path);
    if (textareaPaths.length) {
      return textareaPaths;
    }

    return collectSchemaLeafFields(this.blockSchema, ({ path, schema }) => {
      if (schema?.['type'] === 'array') return null;
      return getSchemaPathUiMeta(this.blockSchema, path).widget === 'textarea' ? path : null;
    });
  }

  private toRichContentParts(path: string): { text: string; isDynamicInput: boolean }[] {
    const content = toStringOrNull(this.getByPath(this.blockConfiguration ?? {}, path));
    if (!content) return [];
    return buildTemplatedRichContentParts(this.blockConfiguration ?? {}, path, this.blockSchema, splitTemplatedTextParts);
  }

  private getByPath(source: Record<string, any>, path: string): unknown {
    return getValueByPath(source, path);
  }

  private isMissingValue(value: unknown): boolean {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0 || value.every((item) => this.isMissingValue(item));
    if (typeof value === 'object') {
      const entries = Object.values(value as Record<string, unknown>);
      return entries.length === 0 || entries.every((item) => this.isMissingValue(item));
    }
    return false;
  }

  private shouldRenderWideField(label: string, isTextarea: boolean) {
    return isTextarea || label.trim().length >= 18;
  }

  private refreshValidationState() {
    const config = this.blockConfiguration ?? {};
    const requiredFields = [
      ...this.schemaRequirements.required,
      ...this.schemaRequirements.conditional.filter((field) => this.conditionalRequiredByPath.get(field.path))
    ].filter((field) => field.path !== 'name')
      .filter((field) => this.isFieldConditionSatisfied(field.path));

    const missingFields = requiredFields
      .filter((field) => {
        if (!this.isPathEnabled(field.path)) return false;
        const definition = this.editableFieldDefinitions.find((candidate) => candidate.path === field.path);
        if (definition && this.isBindableFieldUsingInput(definition)) return false;
        return this.isMissingValue(this.getByPath(config, field.path));
      });

    const missingLabels = new Set(missingFields.map((field) => field.label));

    for (const objectField of this.schemaRequirements.requiredObjects) {
      if (objectField.path === 'name') continue;
      if (!this.isFieldConditionSatisfied(objectField.path)) continue;
      if (!this.isMissingValue(this.getByPath(config, objectField.path))) continue;
      missingLabels.add(objectField.label);
    }

    this.missingRequiredParams = Array.from(missingLabels);

    if (!this.refreshingConditionalRequirements) {
      void this.refreshConditionalRequirements();
    }

    this.refreshView();
  }

  private async refreshConditionalRequirements() {
    if (!this.schemaRequirements.conditional.length) return;

    const type = this.blockType;
    if (!type) return;

    this.refreshingConditionalRequirements = true;
    let changed = false;

    for (const field of this.schemaRequirements.conditional) {
      const required = await this.fetchConditionalRequirement(type, field);
      if (this.conditionalRequiredByPath.get(field.path) !== required) {
        this.conditionalRequiredByPath.set(field.path, required);
        changed = true;
      }
    }

    this.refreshingConditionalRequirements = false;
    if (changed) {
      this.refreshValidationState();
      this.maybeCreateBlockOnServer();
    }
  }

  private async fetchConditionalRequirement(blockType: string, field: ConditionalRequiredField) {
    if (field.requiredWhen) {
      return evaluateUiConditionRule(field.requiredWhen, this.blockConfiguration ?? {}, (path) => this.resolveFieldSchema(path));
    }

    if (!field.retrieverKey) return false;

    const retrieverBlockType = field.retrieverBlockType ?? blockType;
    const context = this.buildRetrieverContext(this.blockConfiguration ?? {}, field.dependsOn);

    try {
      return await firstValueFrom(
        this.fieldRetriever.isFieldRequired(
          retrieverBlockType,
          field.retrieverKey,
          field.dependsOn.length ? context : undefined,
          field.retrieverUrl
        )
      );
    } catch {
      return false;
    }
  }

  private refreshView() {
    queueMicrotask(() => {
      try {
        this.cdr.detectChanges();
        requestAnimationFrame(() => {
          try {
            this.rendered();
          } catch {
            // Node may have been removed while async refresh was running.
          }
        });
      } catch {
        // Node may have been removed while async validation was running.
      }
    });
  }

  private cloneFlowData<T>(value: T): T {
    if (typeof globalThis.structuredClone === 'function') {
      try {
        return globalThis.structuredClone(value);
      } catch {
        // Node runtime objects may include non-cloneable values.
      }
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private cloneCurrentFlowWithNodeChanges(flowData: FlowData): FlowData {
    const nextFlowData = this.cloneFlowData(flowData);
    const nodeData = this.data?.data as Record<string, any> | undefined;
    const blockId = typeof nodeData?.['id'] === 'string' ? nodeData['id'] : null;
    if (!blockId) return nextFlowData;

    const block = nextFlowData.blocks.find((item) => item.id === blockId);
    if (!block) return nextFlowData;

    const configuredName = toStringOrNull(this.blockConfiguration?.['name']);
    block.name = configuredName || this.name || block.name;
    block.typeName = this.blockType ?? block.typeName;
    block.specificConfiguration = this.cloneFlowData(this.blockConfiguration ?? {});
    (block as unknown as Record<string, unknown>)[this.biasAnnotationsProperty] = this.cloneFlowData(
      Array.isArray(nodeData?.[this.biasAnnotationsProperty]) ? nodeData[this.biasAnnotationsProperty] : []
    );

    return nextFlowData;
  }

  private maybeCreateBlockOnServer() {
    const nodeData = this.data?.data as Record<string, unknown> | undefined;
    if (!nodeData?.['__needsServerCreate']) return;
    if (nodeData['__isCreatingOnServer'] === true) return;

    const blockType = this.blockType;
    if (!blockType) return;

    nodeData['__isCreatingOnServer'] = true;
    nodeData['__updateBlockError'] = null;
    const configuration = this.ensureBlockConfiguration();

    this.blocksService.updateBlock(String(nodeData['id'] ?? ''), {
      ...configuration,
      typeName: blockType
    }, {
      flowId: this.editorFlowId(),
      replacesBlockId: String(nodeData['id'] ?? '')
    }).pipe(
      take(1)
    ).subscribe({
      next: (createdBlock) => {
        const current = (this.data?.data ?? {}) as Record<string, unknown>;
        const annotationsProperty = this.biasAnnotationsProperty;
        const replaceNode = current['replaceWithCreatedNode'];
        if (typeof replaceNode === 'function') {
          void replaceNode({
            ...createdBlock,
            id: String(current['id'] ?? createdBlock.id),
            position: (current['position'] as { x: number; y: number } | undefined) ?? createdBlock.position,
            [annotationsProperty]: Array.isArray(current[annotationsProperty])
              ? this.cloneFlowData(current[annotationsProperty])
              : [],
            __biasAnnotationsProperty: annotationsProperty,
            __focusOpen: current['__focusOpen'] === true
          });
          return;
        }

        this.data.data = {
          ...current,
          ...createdBlock,
          id: String(current['id'] ?? createdBlock.id),
          position: (current['position'] as { x: number; y: number } | undefined) ?? createdBlock.position,
          [annotationsProperty]: Array.isArray(current[annotationsProperty])
            ? this.cloneFlowData(current[annotationsProperty])
            : [],
          __biasAnnotationsProperty: annotationsProperty,
          __needsServerCreate: false,
          __isCreatingOnServer: false,
          __createdOnServer: true,
          __updateBlockError: null
        };
        this.name = toStringOrNull(this.ensureBlockConfiguration()['name']) || createdBlock.name || this.name;
        this.refreshParameterFields();
        this.refreshValidationState();
        this.markFlowDirty();
      },
      error: (err) => {
        nodeData['__isCreatingOnServer'] = false;
        nodeData['__updateBlockError'] = err instanceof Error ? err.message : 'Block update failed';
        this.refreshView();
        console.error('Create block failed', err);
      }
    });
  }

  private markBlockForServerRecreate() {
    const nodeData = this.data?.data as Record<string, unknown> | undefined;
    if (!nodeData) return;
    nodeData['__needsServerCreate'] = true;
    nodeData['__createdOnServer'] = false;
    nodeData['__updateBlockError'] = null;
  }

  private isPathVisible(path: string, config = this.blockConfiguration): boolean {
    return isSchemaPathVisible(this.blockSchema, path, config);
  }

  private editorFlowId(): string | null {
    const flowId = this.editorState.currentFlow()?.id;
    return typeof flowId === 'string' && flowId.trim().length > 0 ? flowId.trim() : null;
  }

  private buildRetrieverContext(
    source: Record<string, unknown>,
    dependencies: SchemaRetrieverDependency[]
  ) {
    return buildSchemaRetrieverContext(source, dependencies, {
      baseContext: this.withEditorFlowContext({}),
      resolveContextDependency: (key) => this.resolveEditorContextDependencyValue(key)
    });
  }

  private resolveRetrieverDependencyValue(source: Record<string, unknown>, dependency: SchemaRetrieverDependency): unknown {
    return dependency.source === 'context'
      ? this.resolveEditorContextDependencyValue(dependency.key)
      : getValueByPath(source as Record<string, any>, dependency.path);
  }

  private resolveEditorContextDependencyValue(contextKey: string): unknown {
    if (contextKey === 'flowId') {
      return this.editorFlowId();
    }
    if (contextKey === 'blockId') {
      const blockId = this.blockId;
      return typeof blockId === 'string' && blockId.trim().length > 0 ? blockId.trim() : null;
    }
    if (contextKey === 'inputNames') {
      return this.resolvePorts('input').map((port) => port.name).join(',');
    }
    if (contextKey === 'outputNames') {
      return this.resolvePorts('output').map((port) => port.name).join(',');
    }
    return null;
  }

  private async fetchRetrieverOptions(
    blockType: string,
    retrieverKey: string,
    retrieverUrl: string | null,
    structuredData: boolean,
    context?: Record<string, string>
  ): Promise<NodeSettingOption[]> {
    if (structuredData) {
      const items = await firstValueFrom(
        this.fieldRetriever.retrieveItems<unknown>(
          blockType,
          retrieverKey,
          context,
          retrieverUrl
        )
      );
      return this.toStructuredRetrieverOptions(items ?? []);
    }

    const values = await firstValueFrom(
      this.fieldRetriever.retrieveValues(
        blockType,
        retrieverKey,
        context,
        retrieverUrl
      )
    );
    return (values ?? []).map((value) => ({ label: value, value }));
  }

  private toStructuredRetrieverOptions(items: Array<{ descriptor?: { label?: string; description?: string }; data?: unknown }>) {
    return items
      .map((item, index) => {
        const value = item?.data == null ? '' : String(item.data);
        const label = item.descriptor?.label?.trim() || value || `Item ${index + 1}`;
        const description = item.descriptor?.description?.trim();
        return {
          label: description ? `${label} - ${description}` : label,
          value
        };
      })
      .filter((option) => option.value.trim().length > 0);
  }

  private withEditorFlowContext(context?: Record<string, string>) {
    const nextContext = { ...(context ?? {}) };
    const flowId = this.editorFlowId();
    if (flowId) {
      nextContext['flowId'] = flowId;
    }
    return nextContext;
  }

  private isPathEnabled(path: string, config = this.blockConfiguration, visited = new Set<string>()): boolean {
    if (visited.has(path)) return true;
    visited.add(path);
    return isSchemaPathEnabled(this.blockSchema, path, config);
  }

  private isFieldVisible(field: EditableFieldDefinition): boolean {
    return this.isPathVisible(field.path);
  }

  toggleBooleanParameter(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const definition = this.editableFieldDefinitions.find((field) => field.path === path);
    if (!definition || definition.type !== 'boolean') return;
    if (!this.isFieldVisible(definition) || !this.isPathEnabled(definition.path)) return;

    const config = this.ensureBlockConfiguration();
    const previousValue = this.getByPath(config, path);
    const nextValue = previousValue !== true;
    setSchemaValueByPath(config, path, nextValue);
    resetDependentSchemaRetrieverFields(config, path, this.editableFieldDefinitions);
    if (!schemaValuesEqual(previousValue, nextValue) && this.isStructuralField(path)) {
      this.markBlockForServerRecreate();
    }

    this.pruneInactiveConfiguration(config);
    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
    this.maybeCreateBlockOnServer();
  }

  private isFieldConditionSatisfied(path: string, visited = new Set<string>()): boolean {
    if (visited.has(path)) return true;
    visited.add(path);
    return isSchemaPathVisible(this.blockSchema, path, this.blockConfiguration);
  }

  private toFieldUiMeta(
    schema: Record<string, any> | null | undefined,
    inheritedUi?: Pick<SchemaFieldUiMeta, 'visibleWhen' | 'enabledWhen' | 'group'>
  ) {
    return toSchemaFieldUiMeta(schema, inheritedUi);
  }

  private getFieldUiMeta(path: string) {
    return getSchemaPathUiMeta(this.blockSchema, path);
  }
}
