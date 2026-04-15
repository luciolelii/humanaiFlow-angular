import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, HostListener, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BlockType, currentFlowPortValueKind, flowValueKindLabel, FlowData, FlowPort, FlowValueKind, FLOW_DEPENDANT_PORT_KEY, FLOW_DEPENDENCY_PORT_KEY, normalizeFlowPortValueKinds } from '@models/flow';
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
  parentPath,
  pathToLabel,
  readUiConditionRule,
  readEffectiveUiVisibleConditionRule,
  readUiLabel,
  readUiGroup,
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

type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'unknown';

type RetrieverDependency = {
  key: string;
  path: string;
  source: 'field' | 'context';
};

type NodeOptionsSource = {
  collection: 'inputs' | 'outputs';
  valueField: string;
  labelField: string;
};

type EditableFieldDefinition = {
  path: string;
  label: string;
  type: FieldType;
  enumOptions: string[];
  nodeOptionsSource: NodeOptionsSource | null;
  retrieverBlockType: string | null;
  retrieverKey: string | null;
  retrieverUrl: string | null;
  retrieverStructuredData: boolean;
  retrieverDependsOn: RetrieverDependency[];
  ui: {
    widget: 'textarea' | null;
    acceptVariableAsPlaceholder: boolean;
    structural: boolean;
    bindableAsInput: boolean;
    inputName: string | null;
    inputType: string | null;
    inputMultiple: boolean | null;
    structuralReason?: string;
    label?: string;
    placeholder?: string;
    tip?: string;
    rows?: number;
    visibleWhen: UiConditionRule[];
    enabledWhen: UiConditionRule[];
    group: string | null;
  };
};

type EditableFieldView = {
  path: string;
  label: string;
  value: string;
  wide: boolean;
  expandable: boolean;
  enabled: boolean;
  type: FieldType;
  booleanValue: boolean;
};

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

type EditableFieldGroupView = {
  key: string;
  legend: string;
  fields: EditableFieldView[];
};

type RichContentView = {
  path: string;
  label: string;
  rawValue: string;
  expandable: boolean;
  parts: { text: string; isDynamicInput: boolean }[];
};

type RenderedSocketPort = {
  key: string;
  socket: ClassicPreset.Socket;
};

@Component({
  selector: 'app-generic-node',
  imports: [CommonModule, FormsModule, ReteModule, MatTooltipModule],
  templateUrl: './generic-node.html',
  styleUrl: './generic-node.css',
  host: {
    'data-testid': 'node'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenericNodeComponent {

  private settingsDialog = inject(NodeSettingsDialogService);
  private editorState = inject(EditorStateHolder);
  private fieldRetriever = inject(FieldRetriever);
  private blocksService = inject(BlocksService);
  private cdr = inject(ChangeDetectorRef);

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

  ngOnInit() {
    this.outputs = [];
    this.inputs = [];
    this.parameterFields = [];
    this.parameterFieldGroups = [];
    this.richContentFields = [];
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
    void this.loadSchemaContext();
  }

  @HostListener('click')
  onNodeClick() {
    if (!this.shouldRetrySchemaLoad()) return;
    void this.loadSchemaContext();
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
      this.setByPath(config, this.localEditorPath, parsedValue);
      if (!this.areValuesEqual(previousValue, parsedValue)) {
        this.resetDependentRetrieverFields(config, this.localEditorPath);
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

  private get blockId(): string | null {
    const blockId = this.data?.data?.id;
    return typeof blockId === 'string' && blockId.length > 0 ? blockId : null;
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
    this.setByPath(config, path, nextValue);
    if (!this.areValuesEqual(previousValue, nextValue)) {
      this.resetDependentRetrieverFields(config, path);
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
    if (!schema) return [];

    const definitions: EditableFieldDefinition[] = [];
    const seen = new Set<string>();

    const walk = (
      node: Record<string, any>,
      pathPrefix: string,
      inheritedUi?: { visibleWhen: UiConditionRule[]; enabledWhen: UiConditionRule[]; group: string | null }
    ) => {
      const resolved = resolveSchemaRef(node, schema);
      if (!resolved || typeof resolved !== 'object') return;

      const properties = resolved.properties as Record<string, any> | undefined;
      if (!properties) return;

      for (const [key, childSchema] of Object.entries(properties)) {
        const childResolved = resolveSchemaRef(childSchema as Record<string, any>, schema);
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;
        if (childResolved?.type === 'array') {
          continue;
        }
        const hasChildren = !!childResolved?.properties || childResolved?.type === 'object';
        const childUi = this.toFieldUiMeta(childResolved, inheritedUi);

        if (hasChildren) {
          walk(childResolved as Record<string, any>, path, {
            visibleWhen: childUi.visibleWhen,
            enabledWhen: childUi.enabledWhen,
            group: childUi.group
          });
          continue;
        }

        if (key === 'type' || key === 'name' || key.startsWith('__')) continue;
        if (seen.has(path)) continue;

        seen.add(path);
        definitions.push({
          path,
          label: schemaFieldLabel(path, childResolved),
          type: this.toFieldType(childResolved?.type),
          enumOptions: this.toEnumOptions(childResolved),
          nodeOptionsSource: this.toNodeOptionsSource(childResolved),
          retrieverBlockType: this.toRetrieverBlockType(childResolved),
          retrieverKey: this.toRetrieverKey(childResolved),
          retrieverUrl: this.toRetrieverUrl(childResolved),
          retrieverStructuredData: childResolved?.['x-retriever-structured-data'] === true,
          retrieverDependsOn: this.toRetrieverDependsOn(childResolved, pathPrefix),
          ui: childUi
        });
      }
    };

    walk(schema, '');
    return definitions;
  }

  private buildArrayFieldDefinitions(schema: Record<string, any> | null): ArrayFieldDefinition[] {
    if (!schema) return [];

    const definitions: ArrayFieldDefinition[] = [];
    const seen = new Set<string>();

    const walk = (
      node: Record<string, any>,
      pathPrefix: string,
      inheritedUi?: { visibleWhen: UiConditionRule[]; enabledWhen: UiConditionRule[]; group: string | null }
    ) => {
      const resolved = resolveSchemaRef(node, schema);
      if (!resolved || typeof resolved !== 'object') return;

      const properties = resolved.properties as Record<string, any> | undefined;
      if (!properties) return;

      for (const [key, childSchema] of Object.entries(properties)) {
        const childResolved = resolveSchemaRef(childSchema as Record<string, any>, schema);
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;
        const childUi = this.toFieldUiMeta(childResolved, inheritedUi);

        if (childResolved?.type === 'array') {
          if (key === 'type' || key === 'name' || key.startsWith('__') || seen.has(path)) {
            continue;
          }
          seen.add(path);
          definitions.push({
            path,
            label: schemaFieldLabel(path, childResolved),
            itemSchema: this.resolveArrayItemSchema(childResolved, schema),
            uniqueBy: typeof childResolved?.['x-ui-unique-by'] === 'string' && String(childResolved['x-ui-unique-by']).trim().length > 0
              ? String(childResolved['x-ui-unique-by']).trim()
              : null,
            ui: {
              structural: childUi.structural,
              visibleWhen: childUi.visibleWhen,
              enabledWhen: childUi.enabledWhen,
              group: childUi.group
            }
          });
          continue;
        }

        const hasChildren = !!childResolved?.properties || childResolved?.type === 'object';
        if (hasChildren) {
          walk(childResolved as Record<string, any>, path, {
            visibleWhen: childUi.visibleWhen,
            enabledWhen: childUi.enabledWhen,
            group: childUi.group
          });
        }
      }
    };

    walk(schema, '');
    return definitions;
  }

  private toFieldUiMeta(
    schema: Record<string, any> | null | undefined,
    inheritedUi?: { visibleWhen: UiConditionRule[]; enabledWhen: UiConditionRule[]; group: string | null }
  ) {
    const rawWidget = typeof schema?.['x-ui-widget'] === 'string'
      ? String(schema['x-ui-widget']).toLowerCase().trim()
      : '';
    const normalizedWidget: 'textarea' | null =
      rawWidget === 'textarea' || rawWidget === 'text-area' ? 'textarea' : null;
    const placeholder = typeof schema?.['x-ui-placeholder'] === 'string'
      ? String(schema['x-ui-placeholder'])
      : undefined;
    const tip = schemaFieldDescription(schema) ?? undefined;
    const rowsRaw = schema?.['x-ui-rows'];
    const rows = typeof rowsRaw === 'number' && Number.isFinite(rowsRaw) && rowsRaw > 0
      ? Math.trunc(rowsRaw)
      : undefined;
    const acceptVariableAsPlaceholder = schema?.['x-ui-accept-variable-as-placeholder'] === true;
    const structural = schema?.['x-ui-structural'] === true;
    const bindableAsInput = schema?.['x-ui-bindable-as-input'] === true;
    const inputName = typeof schema?.['x-ui-input-name'] === 'string'
      ? String(schema['x-ui-input-name'])
      : null;
    const inputType = typeof schema?.['x-ui-input-type'] === 'string'
      ? String(schema['x-ui-input-type']).toUpperCase()
      : null;
    const inputMultiple = typeof schema?.['x-ui-input-multiple'] === 'boolean'
      ? Boolean(schema['x-ui-input-multiple'])
      : null;
    const structuralReason = typeof schema?.['x-ui-structural-reason'] === 'string'
      ? String(schema['x-ui-structural-reason'])
      : undefined;
    const visibleWhen = readEffectiveUiVisibleConditionRule(schema);
    const enabledWhen = readUiConditionRule(schema?.['x-ui-enabled-when']);
    const label = readUiLabel(schema?.['x-ui-label']) ?? undefined;
    const isObjectLike = schema?.['type'] === 'object' || !!schema?.['properties'];
    const group = readUiGroup(schema?.['x-ui-group'])
      ?? (isObjectLike ? label ?? null : null)
      ?? inheritedUi?.group
      ?? null;

    return {
      widget: normalizedWidget,
      acceptVariableAsPlaceholder,
      structural,
      bindableAsInput,
      inputName,
      inputType,
      inputMultiple,
      structuralReason,
      label,
      placeholder,
      tip,
      rows,
      visibleWhen: [
        ...(inheritedUi?.visibleWhen ?? []),
        ...(visibleWhen ? [visibleWhen] : [])
      ],
      enabledWhen: [
        ...(inheritedUi?.enabledWhen ?? []),
        ...(enabledWhen ? [enabledWhen] : [])
      ],
      group
    };
  }

  private getFieldUiMeta(path: string) {
    const root = this.blockSchema;
    if (!root) return this.toFieldUiMeta(null);

    let current: Record<string, any> | null = root;
    let inheritedUi = { visibleWhen: [] as UiConditionRule[], enabledWhen: [] as UiConditionRule[], group: null as string | null };

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
        enabledWhen: nextUi.enabledWhen,
        group: nextUi.group
      };
    }

    return this.toFieldUiMeta(current, inheritedUi);
  }

  private isStructuralField(path: string): boolean {
    return this.getFieldUiMeta(path).structural;
  }

  private resolveFieldSchema(path: string): Record<string, any> | null {
    return resolveSchemaPath(this.blockSchema, path);
  }

  private toFieldType(type: unknown): FieldType {
    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'integer') return 'integer';
    if (type === 'boolean') return 'boolean';
    return 'unknown';
  }

  private toRetrieverKey(schema: Record<string, any> | null | undefined): string | null {
    if (!schema || typeof schema !== 'object') return null;

    const fromUrl = this.parseRetrieverUrl(schema['x-retriever-url'])?.key;
    if (fromUrl) return fromUrl;

    const retrieverName = schema['x-retriever-name'];
    return typeof retrieverName === 'string' && retrieverName.length > 0 ? retrieverName : null;
  }

  private toRetrieverBlockType(schema: Record<string, any> | null | undefined): string | null {
    if (!schema || typeof schema !== 'object') return null;
    return this.parseRetrieverUrl(schema['x-retriever-url'])?.blockType
      ?? (typeof schema['x-retriever-owner'] === 'string' && String(schema['x-retriever-owner']).trim().length > 0
        ? String(schema['x-retriever-owner']).trim()
        : null);
  }

  private toEnumOptions(schema: Record<string, any> | null | undefined): string[] {
    const raw = schema?.['enum'];
    if (!Array.isArray(raw)) return [];
    return raw.filter((value): value is string => typeof value === 'string');
  }

  private toNodeOptionsSource(schema: Record<string, any> | null | undefined): NodeOptionsSource | null {
    if (!schema || typeof schema !== 'object') return null;
    const raw = schema['x-ui-options-from-node'];
    if (!raw || typeof raw !== 'object') return null;

    const collection = (raw as Record<string, unknown>)['collection'];
    const valueField = (raw as Record<string, unknown>)['valueField'];
    const labelField = (raw as Record<string, unknown>)['labelField'];
    if ((collection !== 'inputs' && collection !== 'outputs')
      || typeof valueField !== 'string'
      || typeof labelField !== 'string'
      || valueField.trim().length === 0
      || labelField.trim().length === 0) {
      return null;
    }

    return {
      collection,
      valueField: valueField.trim(),
      labelField: labelField.trim()
    };
  }

  private toRetrieverUrl(schema: Record<string, any> | null | undefined): string | null {
    if (!schema || typeof schema !== 'object') return null;
    const rawUrl = schema['x-retriever-url'];
    return typeof rawUrl === 'string' && rawUrl.trim().length > 0 ? rawUrl : null;
  }

  private parseRetrieverUrl(rawUrl: unknown): { blockType: string; key: string } | null {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return null;

    const path = rawUrl.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const retrieverIndex = parts.findIndex((part) => part === 'retriever' || part === 'secure-retriever');
    if (retrieverIndex < 0 || parts.length < retrieverIndex + 3) return null;

    const blockType = parts[retrieverIndex + 1];
    const key = parts[retrieverIndex + 2];
    if (!blockType || !key) return null;

    return { blockType, key };
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

  private toRetrieverDependsOn(schema: Record<string, any> | null | undefined, pathPrefix: string): RetrieverDependency[] {
    if (!schema || typeof schema !== 'object') return [];

    const raw = Array.isArray(schema['x-retriever-depends-on'])
      ? (schema['x-retriever-depends-on'] as unknown[])
      : [];

    return raw
      .filter((dep): dep is string => typeof dep === 'string' && dep.length > 0)
      .map((dep) => this.toRetrieverDependency(dep, pathPrefix));
  }

  private toRetrieverDependency(dependency: string, pathPrefix: string): RetrieverDependency {
    const normalized = dependency.trim();
    if (normalized.startsWith('$context.')) {
      const contextKey = normalized.slice('$context.'.length).trim();
      return {
        key: contextKey,
        path: normalized,
        source: 'context'
      };
    }

    return {
      key: normalized,
      path: pathPrefix ? `${pathPrefix}.${normalized}` : normalized,
      source: 'field'
    };
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

  private isLongTextValue(value: string): boolean {
    return String(value ?? '').trim().length > 80;
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
    const grouped = new Map<string, EditableFieldView[]>();
    const rootFields: EditableFieldView[] = [];

    this.richContentFields = this.richContentPaths()
      .filter((path) => this.isPathVisible(path))
      .map((path) => {
        const rawValue = String(this.getByPath(config, path) ?? '');
        return {
          path,
          label: this.fieldDisplayLabel(path),
          rawValue,
          expandable: this.isLongTextValue(rawValue),
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
      const orderedFields = this.editableFieldDefinitions.map((definition) => {
        const value = this.getByPath(config, definition.path);
        return {
          path: definition.path,
          label: definition.label,
          value: this.fieldDisplayValue(definition, value),
          wide: this.shouldRenderWideField(definition.label, definition.ui.widget === 'textarea'),
          expandable: this.isLongTextValue(this.fieldDisplayValue(definition, value)),
          enabled: this.isPathEnabled(definition.path),
          type: definition.type,
          booleanValue: value === true
        };
      }).filter((field) => !richContentPaths.has(field.path))
        .filter((field) => this.isPathVisible(field.path));

      for (const field of orderedFields) {
        const groupLabel = this.getFieldUiMeta(field.path).group ?? parentPath(field.path);
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
        legend: key.startsWith('group:') ? key.slice('group:'.length) : this.fieldDisplayLabel(key),
        fields
      }));
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
        expandable: this.isLongTextValue(valueToDisplayString(entry.value)),
        enabled: this.isPathEnabled(entry.path),
        type: (typeof entry.value === 'boolean' ? 'boolean' : 'unknown') as FieldType,
        booleanValue: entry.value === true
      }));

    for (const field of fallbackFields) {
      const parentKey = parentPath(field.path);
      if (!parentKey) {
        rootFields.push(field);
        continue;
      }
      if (!grouped.has(parentKey)) {
        grouped.set(parentKey, []);
      }
      grouped.get(parentKey)!.push(field);
    }

    this.parameterFields = rootFields;
    this.parameterFieldGroups = Array.from(grouped.entries()).map(([key, fields]) => ({
      key,
      legend: this.fieldDisplayLabel(key),
      fields
    }));

    this.refreshView();
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
    this.setByPath(config, path, items);
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

    this.setByPath(config, path, items);
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

    for (const [key, rawPropertySchema] of Object.entries(properties)) {
      const propertySchema = resolveSchemaRef(rawPropertySchema as Record<string, any>, schemaRoot);
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
      const isObjectLike = propertySchema?.type === 'object';
      const fieldType =
        options ? 'select' :
          propertySchema?.type === 'boolean' ? 'checkbox' :
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

    for (const [key, rawPropertySchema] of Object.entries(properties)) {
      const propertySchema = resolveSchemaRef(rawPropertySchema as Record<string, any>, schemaRoot);
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
      const isObjectLike = propertySchema?.type === 'object';

      if (propertySchema?.type === 'boolean') {
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

      if (propertySchema?.type === 'number' || propertySchema?.type === 'integer') {
        const numeric = Number(rawValue ?? 0);
        nextItem[key] = Number.isFinite(numeric)
          ? (propertySchema.type === 'integer' ? Math.trunc(numeric) : numeric)
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
    for (const [key, rawPropertySchema] of Object.entries(properties)) {
      const propertySchema = resolveSchemaRef(rawPropertySchema as Record<string, any>, schemaRoot);
      if (shouldSkipSchemaField(key, propertySchema)) continue;
      if (Object.prototype.hasOwnProperty.call(propertySchema ?? {}, 'default')) {
        item[key] = propertySchema.default;
        continue;
      }
      if (propertySchema?.type === 'boolean') {
        item[key] = false;
      } else if (propertySchema?.type === 'number' || propertySchema?.type === 'integer') {
        item[key] = 0;
      } else if (propertySchema?.type === 'object' || this.hasDynamicSchema(propertySchema)) {
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
      const properties = resolved?.['properties'] as Record<string, any> | undefined;
      if (!properties) return;

      for (const [childKey, rawChildSchema] of Object.entries(properties)) {
        const childSchema = resolveSchemaRef(rawChildSchema as Record<string, any>, schema);
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

        const hasChildren = !!childSchema?.['properties'] || childSchema?.type === 'object';
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
            childSchema?.type === 'boolean' ? 'checkbox' :
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
      this.setByPath(nested, nestedPath, value);
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

    const retrieverKey = this.toRetrieverKey(propertySchema);
    const retrieverBlockType = this.toRetrieverBlockType(propertySchema);
    if (!retrieverKey || !retrieverBlockType) return undefined;

    const retrieverDependsOn = this.toRetrieverDependsOn(propertySchema, pathPrefix);
    const retrieverContext = this.buildRetrieverContext(item as Record<string, any>, retrieverDependsOn);

    try {
      return await this.fetchRetrieverOptions(
        retrieverBlockType,
        retrieverKey,
        this.toRetrieverUrl(propertySchema),
        propertySchema['x-retriever-structured-data'] === true,
        retrieverContext
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
    for (const key of Object.keys(properties)) {
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
      (left, right) => this.areValuesEqual(left, right)
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

  private setByPath(target: Record<string, any>, path: string, value: unknown) {
    const keys = path.split('.').filter(Boolean);
    if (!keys.length) return;

    let current: Record<string, any> = target;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      const next = current[key];
      if (next == null || typeof next !== 'object' || Array.isArray(next)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  private deleteByPath(target: Record<string, any>, path: string) {
    const keys = path.split('.').filter(Boolean);
    if (!keys.length) return;

    let current: Record<string, any> | undefined = target;
    const parents: Array<{ owner: Record<string, any>; key: string }> = [];

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      const next = current?.[key];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        return;
      }
      parents.push({ owner: current!, key });
      current = next as Record<string, any>;
    }

    if (!current) return;
    delete current[keys[keys.length - 1]];

    for (let i = parents.length - 1; i >= 0; i--) {
      const { owner, key } = parents[i];
      const value = owner[key];
      if (!value || typeof value !== 'object' || Array.isArray(value)) break;
      if (Object.keys(value).length > 0) break;
      delete owner[key];
    }
  }

  private pruneInactiveConfiguration(config: Record<string, any>) {
    const candidatePaths = [
      ...this.editableFieldDefinitions.map((field) => field.path),
      ...this.arrayFieldDefinitions.map((field) => field.path)
    ].sort((left, right) => right.length - left.length);

    for (const path of candidatePaths) {
      if (this.isPathVisible(path) && this.isPathEnabled(path)) continue;
      this.deleteByPath(config, path);
    }
  }

  private resetDependentRetrieverFields(
    config: Record<string, any>,
    changedPath: string,
    visited = new Set<string>()
  ) {
    const dependentFields = this.editableFieldDefinitions.filter((definition) =>
      definition.retrieverDependsOn.some((dep) => dep.path === changedPath)
    );

    for (const field of dependentFields) {
      if (visited.has(field.path)) continue;
      visited.add(field.path);
      this.setByPath(config, field.path, '');
      this.resetDependentRetrieverFields(config, field.path, visited);
    }
  }

  private areValuesEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private richContentPaths(): string[] {
    const textareaPaths = this.editableFieldDefinitions
      .filter((field) => field.ui.widget === 'textarea')
      .map((field) => field.path);
    if (textareaPaths.length) {
      return textareaPaths;
    }

    return this.findMainContentCandidatePaths(this.blockSchema);
  }

  private toRichContentParts(path: string): { text: string; isDynamicInput: boolean }[] {
    const content = toStringOrNull(this.getByPath(this.blockConfiguration ?? {}, path));
    if (!content) return [];

    const ui = this.getFieldUiMeta(path);
    if (ui.widget === 'textarea' && ui.acceptVariableAsPlaceholder) {
      return splitTemplatedTextParts(content);
    }

    return [{ text: content, isDynamicInput: false }];
  }

  private findMainContentCandidatePaths(schema: Record<string, any> | null): string[] {
    if (!schema) return [];

    const paths: string[] = [];
    const seen = new Set<string>();

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
        if (!isTextarea || seen.has(path)) continue;

        seen.add(path);
        paths.push(path);
      }
    };

    walk(schema, '');
    return paths;
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
        const replaceNode = current['replaceWithCreatedNode'];
        if (typeof replaceNode === 'function') {
          void replaceNode({
            ...createdBlock,
            position: (current['position'] as { x: number; y: number } | undefined) ?? createdBlock.position
          });
          return;
        }

        this.data.data = {
          ...current,
          ...createdBlock,
          position: (current['position'] as { x: number; y: number } | undefined) ?? createdBlock.position,
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

  private isPathVisible(path: string): boolean {
    return this.isFieldConditionSatisfied(path);
  }

  private editorFlowId(): string | null {
    const flowId = this.editorState.currentFlow()?.id;
    return typeof flowId === 'string' && flowId.trim().length > 0 ? flowId.trim() : null;
  }

  private buildRetrieverContext(
    source: Record<string, unknown>,
    dependencies: RetrieverDependency[]
  ) {
    const context = this.withEditorFlowContext({});
    for (const dep of dependencies) {
      const value = this.resolveRetrieverDependencyValue(source, dep);
      context[dep.key] = value == null ? '' : String(value);
    }
    return context;
  }

  private resolveRetrieverDependencyValue(source: Record<string, unknown>, dependency: RetrieverDependency): unknown {
    if (dependency.source === 'context') {
      return this.resolveEditorContextDependencyValue(dependency.key);
    }
    return getValueByPath(source as Record<string, any>, dependency.path);
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

  private isPathEnabled(path: string, visited = new Set<string>()): boolean {
    if (visited.has(path)) return true;
    visited.add(path);

    const ui = this.getFieldUiMeta(path);
    return ui.enabledWhen.every((rule) => {
      if (!rule) return true;
      return evaluateUiConditionRule(rule, this.blockConfiguration, (fieldPath) => this.resolveFieldSchema(fieldPath));
    });
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
    this.setByPath(config, path, nextValue);
    this.resetDependentRetrieverFields(config, path);
    if (!this.areValuesEqual(previousValue, nextValue) && this.isStructuralField(path)) {
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

    const ui = this.getFieldUiMeta(path);
    return ui.visibleWhen.every((rule) => {
      if (!rule) return true;
      return evaluateUiConditionRule(rule, this.blockConfiguration, (fieldPath) => this.resolveFieldSchema(fieldPath));
    });
  }
}
