import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostBinding, HostListener, Input, OnDestroy, effect, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { currentFlowPortValueKind, flowValueKindLabel, FlowData, FLOW_DEPENDANT_PORT_KEY, FLOW_DEPENDENCY_PORT_KEY } from '@models/flow';
import { NodeSettingField, NodeSettingOption, NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { ContainersService } from '@services/containers/containers';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { SubflowPreviewDialogService } from '@services/dialogs/subflow-preview-dialog';
import { EditorStateHolder } from '@stores/flow-editor';
import { CONTAINER_SUBFLOW_DRAG_MIME } from './container-node-drag';
import { NodeFocusModalController } from '../node-focus-modal-controller';
import { firstValueFrom } from 'rxjs';
import { extractSchemaRequirements, SchemaRequirements } from '../schema-requirements';
import { evaluateUiConditionRule, getValueByPath, parentPath, pathToLabel, resolveNodeIcon, resolveSchemaPath, splitTemplatedTextParts, valueToDisplayString } from '../node-utility';
import {
  collectSchemaFlowDataFields,
  flowDataNodeCount,
  isFlowDataFieldPath,
  normalizeFlowDataValue,
  type SchemaFlowDataFieldDefinition
} from '../flow-data-schema-fields';
import {
  buildSchemaEditableFieldDefinitions,
  buildSchemaFieldViewModel,
  buildSchemaRetrieverContext,
  buildOrderedSchemaDisplay,
  pruneInactiveSchemaConfiguration,
  resetDependentSchemaRetrieverFields,
  schemaValuesEqual,
  setSchemaValueByPath,
  type SchemaEditableFieldDefinition,
  type SchemaDisplayGroup,
  type SchemaDisplayItem,
  type SchemaDisplaySection,
  type SchemaFieldType,
  type SchemaNodeOptionsSource,
  type SchemaParameterFieldView,
  type SchemaRichContentFieldView,
  type SchemaRetrieverDependency,
  buildTemplatedRichContentParts,
  getSchemaPathUiMeta,
  isLongTextValue,
  isSchemaPathEnabled,
  isSchemaPathVisible,
  schemaNodeOptionsSource
} from '../schema-driven-fields';

type ContainerFieldType = SchemaFieldType;

type NodeOptionsSource = SchemaNodeOptionsSource;

type ContainerFieldDefinition = SchemaEditableFieldDefinition;

type ContainerFieldView = SchemaParameterFieldView<ContainerFieldType>;

type RichContentView = SchemaRichContentFieldView;

type ContainerDisplayItem = SchemaDisplayItem<ContainerFieldView, RichContentView>;

type ContainerFieldGroupView = SchemaDisplayGroup<ContainerDisplayItem>;

type ContainerDisplaySection = SchemaDisplaySection<ContainerDisplayItem>;

type ContainerFlowFieldView = SchemaFlowDataFieldDefinition & {
  flow: FlowData | null;
  blockCount: number;
  replaceConfirmOpen: boolean;
  importLoading: boolean;
};

@Component({
  selector: 'app-container-node',
  imports: [CommonModule, FormsModule, ReteModule, MatTooltipModule],
  templateUrl: './container-node.html',
  styleUrl: './container-node.css',
  host: {
    'data-testid': 'node'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContainerNodeComponent implements OnDestroy {
  private editorState = inject(EditorStateHolder);
  private cdr = inject(ChangeDetectorRef);
  private hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focusModal = new NodeFocusModalController(this.hostElement, 'container-node-focus-placeholder');
  private subflowPreview = inject(SubflowPreviewDialogService);
  private fieldRetriever = inject(FieldRetriever);
  private containersService = inject(ContainersService);
  private settingsDialog = inject(NodeSettingsDialogService);
  private containerSchema: Record<string, any> | null = null;
  private schemaRequirements: SchemaRequirements = { required: [], requiredObjects: [], conditional: [] };
  private containerFieldDefinitions: ContainerFieldDefinition[] = [];
  private containerFlowFieldDefinitions: SchemaFlowDataFieldDefinition[] = [];
  deleteConfirmOpen = false;
  replaceConfirmSelection: { path: string; selection: string[] } | null = null;
  importLoadingPath: string | null = null;
  private importErrorMessage: string | null = null;
  parameterFields: ContainerFieldView[] = [];
  parameterFieldGroups: ContainerFieldGroupView[] = [];
  richContentFields: RichContentView[] = [];
  parameterDisplayItems: ContainerDisplayItem[] = [];
  parameterDisplaySections: ContainerDisplaySection[] = [];
  schemaReady = false;
  focusOpen = false;
  private schemaLoading = false;
  nameEditorOpen = false;
  draftName = '';

  /**
   * This template renders inside a node card, which rete.js positions with a
   * CSS `transform` for pan/zoom, so a plain fixed-position backdrop would be
   * confined to the node's box. A native `<dialog>` shown via `showModal()`
   * escapes that via the browser's top layer, same fix as bias-annotations.
   */
  private readonly nameEditorDialog = viewChild<ElementRef<HTMLDialogElement>>('nameEditorDialog');

  constructor() {
    effect(() => {
      const dialog = this.nameEditorDialog()?.nativeElement;
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
      }
    });
  }

  onNameEditorDialogClick(event: MouseEvent) {
    if (event.target === this.nameEditorDialog()?.nativeElement) {
      this.cancelNameEditor(event);
    }
  }

  get isSchemaLoading() {
    return this.schemaLoading;
  }

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

  @HostBinding('class.container-node--readonly') get readonlyClass() {
    return this.isReadonly;
  }

  ngOnInit() {
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

  get name() {
    return String(this.configuration?.['name'] ?? this.data?.data?.name ?? 'Container');
  }

  get containerLabel() {
    return pathToLabel(this.typeName.replace(/Container$/, ' Container'));
  }

  nodeIcon(): { type: 'class' | 'img'; value: string } {
    const icon = resolveNodeIcon(this.containerSchema, false);
    if (icon.type === 'class' && icon.value === 'bi bi-person-check-fill') {
      return { type: 'class', value: 'bi bi-box-seam' };
    }
    return icon.type === 'img' && icon.value === 'llm_node.png'
      ? { type: 'class', value: 'bi bi-box-seam' }
      : icon;
  }

  get inputs() {
    return Object.entries(this.data?.inputs ?? {})
      .filter(([key]) => key !== FLOW_DEPENDENCY_PORT_KEY)
      .map(([key, input]) => ({
      key,
      socket: (input as any).socket as ClassicPreset.Socket
      }));
  }

  get outputs() {
    return Object.entries(this.data?.outputs ?? {})
      .filter(([key]) => key !== FLOW_DEPENDANT_PORT_KEY)
      .map(([key, output]) => ({
      key,
      socket: (output as any).socket as ClassicPreset.Socket
      }));
  }

  get dependencyInput() {
    const input = this.data?.inputs?.[FLOW_DEPENDENCY_PORT_KEY];
    return input
      ? { key: FLOW_DEPENDENCY_PORT_KEY, socket: (input as any).socket as ClassicPreset.Socket }
      : null;
  }

  get dependantOutput() {
    const output = this.data?.outputs?.[FLOW_DEPENDANT_PORT_KEY];
    return output
      ? { key: FLOW_DEPENDANT_PORT_KEY, socket: (output as any).socket as ClassicPreset.Socket }
      : null;
  }

  get hasExecutionDependencyPorts() {
    return !!this.dependencyInput || !!this.dependantOutput;
  }

  get selectedCount() {
    return this.editorState.selectedBlockIds().filter((id) => id !== this.blockId).length;
  }

  get flowFields(): ContainerFlowFieldView[] {
    return this.resolveFlowFieldDefinitions().map((definition) => {
      const flow = this.flowAtPath(definition.path);
      return {
        ...definition,
        flow,
        blockCount: flowDataNodeCount(flow),
        replaceConfirmOpen: this.replaceConfirmSelection?.path === definition.path,
        importLoading: this.importLoadingPath === definition.path
      };
    });
  }

  get replaceConfirmOpen() {
    return !!this.replaceConfirmSelection?.selection.length;
  }

  get hasFlowDropzones() {
    return this.flowFields.length > 0;
  }

  get assignmentErrorMessage() {
    const value = this.data?.data?.['__containerAssignmentError'];
    if (typeof value === 'string' && value.length > 0) return value;
    return this.importErrorMessage;
  }

  get isAssigning() {
    return this.data?.data?.['__containerAssigning'] === true;
  }

  get missingRequiredParams() {
    const config = this.configuration ?? {};
    const flowFieldDefinitions = this.resolveFlowFieldDefinitions();
    const flowFieldPaths = new Set(flowFieldDefinitions.map((field) => field.path));
    const requiredFields = [
      ...this.schemaRequirements.required,
      ...this.schemaRequirements.conditional.filter((field) =>
        field.requiredWhen
          ? evaluateUiConditionRule(field.requiredWhen, config, (path) => this.resolveFieldSchema(path))
          : false
      )
    ].filter((field) => field.path !== 'type');

    return requiredFields
      .filter((field, index, fields) => fields.findIndex((candidate) => candidate.path === field.path) === index)
      .filter((field) => field.path !== 'name')
      .filter((field) => !isFlowDataFieldPath(field.path, flowFieldDefinitions))
      .filter((field) => this.isFieldEnabled(field.path, config))
      .filter((field) => this.isMissingValue(getValueByPath(config, field.path)))
      .map((field) => field.label)
      .concat(
        this.schemaRequirements.requiredObjects
          .filter((field) => field.path !== 'name')
          .filter((field) => !isFlowDataFieldPath(field.path, flowFieldDefinitions))
          .filter((field) => this.isFieldEnabled(field.path, config))
          .filter((field) => this.isMissingValue(getValueByPath(config, field.path)))
          .map((field) => field.label)
      )
      .concat(
        this.schemaRequirements.requiredObjects
          .filter((field) => flowFieldPaths.has(field.path))
          .filter((field) => this.isFieldEnabled(field.path, config))
          .filter((field) => !this.flowAtPath(field.path))
          .map((field) => field.label)
      )
      .filter((field, index, fields) => fields.indexOf(field) === index);
  }

  hasParameterFields() {
    return this.parameterDisplaySections.length > 0;
  }

  hasMainContent() {
    return this.richContentFields.length > 0;
  }

  formatDynamicInputToken(token: string): string {
    const match = token.match(/^\$\{\{\s*([^}]+?)\s*\}\}$/);
    return match ? match[1] : token;
  }

  inputDisplayLabel(inputKey: string) {
    return this.resolvePortName('input', inputKey);
  }

  outputDisplayLabel(outputKey: string) {
    return this.resolvePortName('output', outputKey);
  }

  inputKindLabel(inputKey: string) {
    const port = this.resolvePortDefinition('input', inputKey);
    return port ? flowValueKindLabel(currentFlowPortValueKind(port)) : 'ANY';
  }

  outputKindLabel(outputKey: string) {
    const port = this.resolvePortDefinition('output', outputKey);
    return port ? flowValueKindLabel(currentFlowPortValueKind(port)) : 'ANY';
  }

  inputDisplayLabelParts(inputKey: string) {
    return this.toPortLabelParts(this.inputDisplayLabel(inputKey));
  }

  outputDisplayLabelParts(outputKey: string) {
    return this.toPortLabelParts(this.outputDisplayLabel(outputKey));
  }

  async importSubflow(flowField: ContainerFlowFieldView, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly || this.importLoadingPath || this.replaceConfirmOpen) return;

    this.importLoadingPath = flowField.path;
    this.importErrorMessage = null;

    try {
      const retriever = this.resolveStructuredRetrieverConfig(flowField);
      if (!retriever || !retriever.structuredData) {
        this.importErrorMessage = `${flowField.label} import is not available for this container.`;
        return;
      }

      const items = await firstValueFrom(
        this.fieldRetriever.retrieveItems<FlowData>(
          retriever.blockType,
          retriever.key,
          {
            context: 'CONTAINER',
            validOnly: 'true',
            includeValidation: 'false'
          },
          retriever.retrieverUrl
        )
      );

      if (!items.length) {
        this.importErrorMessage = 'No importable flows were returned by the retriever.';
        return;
      }

      const result = await this.settingsDialog.open({
        title: 'Import flow into container',
        fields: [
          {
            key: 'selectedFlow',
            label: 'Available flows',
            type: 'select',
            required: true,
            options: items.map((item, index) => ({
              value: String(index),
              label: item.descriptor.description
                ? `${item.descriptor.label} - ${item.descriptor.description}`
                : item.descriptor.label
            }))
          }
        ],
        initial: {
          selectedFlow: '0'
        }
      });
      if (!result) return;

      const selectedIndex = Number(result['selectedFlow'] ?? -1);
      const selectedItem = Number.isInteger(selectedIndex) ? items[selectedIndex] : undefined;
      if (!selectedItem?.data) {
        this.importErrorMessage = 'Invalid flow selection.';
        return;
      }

      const assignImportedSubflow = this.data?.data?.assignImportedSubflow;
      if (typeof assignImportedSubflow !== 'function') {
        this.importErrorMessage = 'Container import is not available in the editor runtime.';
        return;
      }

      await assignImportedSubflow(selectedItem.data, flowField.path, retriever.validationUrl);
      this.refreshParameterFields();
    } catch {
      this.importErrorMessage = 'Failed to load importable flows.';
    } finally {
      this.importLoadingPath = null;
    }
  }

  openNameEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;
    this.draftName = this.name;
    this.nameEditorOpen = true;
  }

  cancelNameEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.nameEditorOpen = false;
    this.draftName = this.name;
  }

  onDraftNameChange(value: string) {
    this.draftName = value;
  }

  saveNameEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const nextName = this.draftName.trim().slice(0, 20);
    if (!nextName || nextName === this.name) {
      this.cancelNameEditor();
      return;
    }

    const nextConfiguration = this.cloneConfiguration();
    nextConfiguration['name'] = nextName;
    this.data.data = {
      ...this.data.data,
      name: nextName,
      specificConfiguration: nextConfiguration
    };
    this.updateCurrentFlowData(nextConfiguration);
    this.refreshParameterFields();
    this.refreshView();
    this.nameEditorOpen = false;
  }

  async openParameterEditor(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const definition = this.containerFieldDefinitions.find((field) => field.path === path);
    if (!definition || !this.isFieldEnabled(definition.path)) return;

    const initialValue = this.getEditorInitialValue(definition);
    const field: NodeSettingField = {
      key: definition.path,
      label: definition.label,
      type: this.toDialogFieldType(definition),
      required: this.missingRequiredParams.includes(definition.label),
      placeholder: definition.ui.placeholder,
      tip: definition.ui.tip,
      rows: definition.ui.widget === 'textarea' ? definition.ui.rows ?? 6 : undefined,
      options: await this.resolveSelectableOptions(definition)
    };

    const result = await this.settingsDialog.open({
      title: `Edit ${definition.label}`,
      fields: [field],
      initial: {
        [definition.path]: initialValue
      }
    });

    if (!result) return;
    await this.applyFieldValue(definition, result[definition.path]);
  }

  async toggleBooleanParameter(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const definition = this.containerFieldDefinitions.find((field) => field.path === path);
    if (!definition || definition.type !== 'boolean' || !this.isFieldEnabled(definition.path)) return;

    const currentValue = getValueByPath(this.configuration ?? {}, definition.path);
    await this.applyFieldValue(definition, currentValue !== true);
  }

  onDropZoneDragOver(event: DragEvent, flowField: ContainerFlowFieldView) {
    if (this.isReadonly) return;
    if (!this.canAcceptSelectionDrop(flowField.path)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDropZoneDrop(event: DragEvent, flowField: ContainerFlowFieldView) {
    if (this.isReadonly) return;
    event.preventDefault();
    event.stopPropagation();

    const raw = event.dataTransfer?.getData(CONTAINER_SUBFLOW_DRAG_MIME);
    const payload = this.parseDraggedSelection(raw);
    if (!payload.length) return;

    if (flowField.blockCount > 0) {
      this.replaceConfirmSelection = { path: flowField.path, selection: payload };
      this.editorState.stopDraggingSelectedBlocks();
      return;
    }

    this.assignSelectionToContainer(flowField, payload);
  }

  onDropZoneDragLeave(_: DragEvent) {
    if (this.isReadonly) return;
    this.editorState.stopDraggingSelectedBlocks();
  }

  confirmReplaceSubflow(flowField: ContainerFlowFieldView, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const payload = this.replaceConfirmSelection?.path === flowField.path
      ? this.replaceConfirmSelection.selection
      : null;
    this.replaceConfirmSelection = null;
    if (!payload?.length) return;

    this.assignSelectionToContainer(flowField, payload);
  }

  cancelReplaceSubflow(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.replaceConfirmSelection = null;
  }

  deleteNode(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;
    if (!this.deleteConfirmOpen) {
      this.deleteConfirmOpen = true;
      return;
    }

    const remove = this.data?.data?.deleteNode;
    if (typeof remove === 'function') {
      void remove();
    }
  }

  cancelDelete(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.deleteConfirmOpen = false;
  }

  cloneCurrentNode(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const cloneNode = this.data?.data?.cloneNode;
    if (typeof cloneNode === 'function') {
      void cloneNode();
    }
  }

  openSubflowPreview(flowField: ContainerFlowFieldView, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!flowField.flow) return;
    this.subflowPreview.open(flowField.flow, `${this.name} ${flowField.label}`, this.name);
  }

  async openFieldPreview(field: ContainerFieldView, event?: Event) {
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

  private get configuration(): Record<string, unknown> | null {
    const value = this.data?.data?.specificConfiguration;
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  }

  private get blockId(): string | null {
    const blockId = this.data?.data?.id;
    return typeof blockId === 'string' && blockId.length > 0 ? blockId : null;
  }

  private get typeName(): string {
    return String(this.data?.data?.typeName ?? 'GenericContainer');
  }

  private resolveFlowFieldDefinitions(): SchemaFlowDataFieldDefinition[] {
    if (this.containerFlowFieldDefinitions.length) return this.containerFlowFieldDefinitions;

    const config = this.configuration ?? {};
    const configuredFields = Object.keys(config)
      .filter((key) => normalizeFlowDataValue(config[key]))
      .map((key) => this.fallbackSubflowDefinition(key, pathToLabel(key)));

    if (configuredFields.length) {
      return configuredFields;
    }

    if (!this.schemaReady) {
      return [this.fallbackSubflowDefinition()];
    }

    return [];
  }

  private fallbackSubflowDefinition(path = 'subFlow', label = 'Subflow'): SchemaFlowDataFieldDefinition {
    return {
      path,
      label,
      retrieverBlockType: 'Flows',
      retrieverKey: path,
      retrieverUrl: null,
      retrieverStructuredData: false,
      retrieverDependsOn: [],
      validationUrl: null,
      validationType: null,
      requiresAuth: false,
      ui: getSchemaPathUiMeta(this.containerSchema, path)
    };
  }

  private flowAtPath(path: string): FlowData | null {
    return normalizeFlowDataValue(getValueByPath(this.configuration ?? {}, path));
  }

  private canAcceptSelectionDrop(path: string) {
    return !this.isAssigning
      && (!this.replaceConfirmOpen || this.replaceConfirmSelection?.path === path)
      && this.selectedCount > 0;
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

  private assignSelectionToContainer(flowField: ContainerFlowFieldView, payload: string[]) {
    this.importErrorMessage = null;
    const assign = this.data?.data?.assignSelectedBlocksToContainer;
    if (typeof assign !== 'function' || !payload.length) return;

    void assign(payload, flowField.path, flowField.validationUrl);
    this.editorState.stopDraggingSelectedBlocks();
  }

  private parseDraggedSelection(raw: string | undefined) {
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
    } catch {
      return [];
    }
  }

  private resolvePortName(kind: 'input' | 'output', key: string) {
    const port = this.resolvePortDefinition(kind, key);
    return typeof port?.name === 'string' && port.name.length > 0 ? port.name : key;
  }

  private toPortLabelParts(label: string) {
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

  private resolvePortDefinition(kind: 'input' | 'output', key: string) {
    const ports = this.data?.data?.[kind === 'input' ? 'inputs' : 'outputs'];
    if (!Array.isArray(ports)) return null;
    return ports.find((item: any) => item?.name === key) ?? null;
  }

  private resolveStructuredRetrieverConfig(flowField: SchemaFlowDataFieldDefinition): {
    blockType: string;
    key: string;
    retrieverUrl: string;
    validationUrl: string | null;
    structuredData: boolean;
  } | null {
    if (!flowField.retrieverUrl) return null;

    return {
      blockType: flowField.retrieverBlockType ?? this.typeName,
      key: flowField.retrieverKey ?? flowField.path,
      retrieverUrl: flowField.retrieverUrl,
      validationUrl: flowField.validationUrl,
      structuredData: flowField.retrieverStructuredData
    };
  }

  private async loadSchemaContext() {
    if (this.schemaLoading) return;
    this.schemaLoading = true;
    this.schemaReady = false;
    try {
      const containerType = this.containersService.peekContainerType(this.typeName) ?? await this.containersService.getContainerType(this.typeName);
      this.containerSchema = (containerType?.schema ?? null) as Record<string, any> | null;
      this.schemaRequirements = extractSchemaRequirements(this.containerSchema);
      this.containerFlowFieldDefinitions = collectSchemaFlowDataFields(this.containerSchema);
      this.containerFieldDefinitions = this.buildContainerFieldDefinitions(this.containerSchema);
      this.refreshParameterFields();
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
    return !this.containerSchema || this.containerFieldDefinitions.length === 0;
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

  private refreshParameterFields() {
    const config = this.configuration ?? {};
    const grouped = buildSchemaFieldViewModel({
      definitions: this.containerFieldDefinitions.filter((field) => !this.isContainerTypeField(field.path)),
      config,
      richContentPaths: this.richContentPaths(),
      isPathVisible: (path, nextConfig) => this.isFieldVisible(path, nextConfig),
      isPathEnabled: (path, nextConfig) => this.isFieldEnabled(path, nextConfig),
      getFieldValue: (definition, nextConfig) => valueToDisplayString(getValueByPath(nextConfig, definition.path)),
      isFieldWide: (definition) => definition.ui.widget === 'textarea' || definition.label.length >= 18,
      getRichContentParts: (path) => this.toRichContentParts(path),
      resolveGroupLabel: (path) => getSchemaPathUiMeta(this.containerSchema, path).group ?? parentPath(path)
    });

    const allFields = [
      ...grouped.parameterFields,
      ...grouped.parameterFieldGroups.flatMap((group) => group.fields)
    ];
    const allRichContentFields = [
      ...grouped.richContentFields,
      ...grouped.parameterFieldGroups.flatMap((group) => group.richContentFields)
    ];

    this.parameterFields = grouped.parameterFields;
    this.richContentFields = grouped.richContentFields;
    const ordered = buildOrderedSchemaDisplay({
      definitions: this.containerFieldDefinitions.filter((field) => !this.isContainerTypeField(field.path)),
      fields: allFields,
      richContentFields: allRichContentFields,
      resolveGroupLabel: (path) => getSchemaPathUiMeta(this.containerSchema, path).group ?? parentPath(path)
    });
    this.parameterDisplayItems = ordered.rootItems;
    this.parameterFieldGroups = ordered.groups;
    this.parameterDisplaySections = ordered.sections;
  }

  private buildContainerFieldDefinitions(schema: Record<string, any> | null): ContainerFieldDefinition[] {
    return buildSchemaEditableFieldDefinitions(schema, {
      shouldSkip: ({ key, path }) =>
        key.startsWith('__') || path === 'name' || isFlowDataFieldPath(path, this.resolveFlowFieldDefinitions()) || this.isContainerTypeField(path)
    });
  }

  private richContentPaths(): string[] {
    return this.containerFieldDefinitions
      .filter((field) => !this.isContainerTypeField(field.path))
      .filter((field) => field.ui.widget === 'textarea')
      .map((field) => field.path);
  }

  private isContainerTypeField(path: string): boolean {
    return [
      'type',
      'typeName',
      'containerType',
      'configurationType',
      'configurationClass'
    ].some((key) => path === key || path.endsWith(`.${key}`));
  }

  private toRichContentParts(path: string): { text: string; isDynamicInput: boolean }[] {
    return buildTemplatedRichContentParts(this.configuration ?? {}, path, this.containerSchema, splitTemplatedTextParts);
  }

  private isFieldVisible(path: string, config = this.configuration ?? {}, visited = new Set<string>()): boolean {
    if (visited.has(path)) return true;
    visited.add(path);
    return isSchemaPathVisible(this.containerSchema, path, config);
  }

  private isFieldEnabled(path: string, config = this.configuration ?? {}, visited = new Set<string>()): boolean {
    if (visited.has(path)) return true;
    visited.add(path);
    return isSchemaPathEnabled(this.containerSchema, path, config);
  }

  private toDialogFieldType(definition: ContainerFieldDefinition): NodeSettingField['type'] {
    if (definition.type === 'boolean') return 'checkbox';
    if (definition.ui.widget === 'textarea') return 'textarea';
    if (definition.enumOptions.length || definition.nodeOptionsSource || definition.retrieverKey) return 'select';
    return 'text';
  }

  private async resolveSelectableOptions(definition: ContainerFieldDefinition): Promise<NodeSettingOption[] | undefined> {
    if (definition.nodeOptionsSource) {
      return this.resolveNodeOptions(definition.nodeOptionsSource);
    }
    if (definition.enumOptions.length) {
      return definition.enumOptions.map((option) => ({ label: option, value: option }));
    }
    if (!definition.retrieverKey) return undefined;

    try {
      return await this.fetchRetrieverOptions(definition);
    } catch {
      return [];
    }
  }

  private resolveNodeOptions(source: NodeOptionsSource): NodeSettingOption[] {
    const items = source.collection === 'inputs'
      ? (Array.isArray(this.data?.data?.inputs) ? this.data.data.inputs : [])
      : (Array.isArray(this.data?.data?.outputs) ? this.data.data.outputs : []);

    return items
      .map((item: unknown) => {
        const record = item && typeof item === 'object' ? item as Record<string, unknown> : null;
        const value = record?.[source.valueField];
        const label = record?.[source.labelField];
        if (typeof value !== 'string' || typeof label !== 'string' || value.trim().length === 0 || label.trim().length === 0) {
          return null;
        }
        return { label, value } satisfies NodeSettingOption;
      })
      .filter((option: NodeSettingOption | null): option is NodeSettingOption => option != null);
  }

  private getEditorInitialValue(definition: ContainerFieldDefinition): string | boolean {
    const raw = getValueByPath(this.configuration ?? {}, definition.path);
    if (definition.type === 'boolean') return raw === true;
    if (raw == null) return '';
    return String(raw);
  }

  private async applyFieldValue(definition: ContainerFieldDefinition, rawValue: string | boolean | undefined) {
    const nextValue = this.parseFieldValue(definition, rawValue);
    const nextConfiguration = this.cloneConfiguration();
    const previousValue = getValueByPath(nextConfiguration, definition.path);
    setSchemaValueByPath(nextConfiguration, definition.path, nextValue);
    if (!schemaValuesEqual(previousValue, nextValue)) {
      resetDependentSchemaRetrieverFields(nextConfiguration, definition.path, this.containerFieldDefinitions);
    }
    this.pruneInactiveConfiguration(nextConfiguration);

    if (definition.ui.structural) {
      this.updateCurrentFlowData(nextConfiguration);
      await this.recreateContainer(nextConfiguration);
      return;
    }

    this.data.data = {
      ...this.data.data,
      specificConfiguration: nextConfiguration
    };
    this.refreshParameterFields();
    this.updateCurrentFlowData(nextConfiguration);
    this.refreshView();
  }

  private parseFieldValue(definition: ContainerFieldDefinition, rawValue: string | boolean | undefined): unknown {
    if (definition.type === 'boolean') return rawValue === true;
    const stringValue = typeof rawValue === 'string' ? rawValue : '';
    if (definition.type === 'number' || definition.type === 'integer') {
      const parsed = Number(stringValue);
      if (!Number.isFinite(parsed)) return null;
      return definition.type === 'integer' ? Math.trunc(parsed) : parsed;
    }
    return stringValue;
  }

  private cloneConfiguration(): Record<string, unknown> {
    if (typeof globalThis.structuredClone === 'function') {
      try {
        return globalThis.structuredClone(this.configuration ?? {});
      } catch {
        // Ignore non-cloneable runtime metadata.
      }
    }
    return JSON.parse(JSON.stringify(this.configuration ?? {})) as Record<string, unknown>;
  }

  private async recreateContainer(nextConfiguration: Record<string, unknown>) {
    const current = (this.data?.data ?? {}) as Record<string, unknown>;
    const containerId = String(current['id'] ?? '');
    if (!containerId) return;

    this.data.data = {
      ...current,
      __containerAssigning: true,
      __containerAssignmentError: null,
      specificConfiguration: nextConfiguration
    };
    this.refreshView();

    try {
      const createdContainer = await firstValueFrom(
        this.containersService.createContainer(containerId, {
          ...nextConfiguration,
          position: current['position'],
          typeName: this.typeName
        })
      );

      const replaceNode = current['replaceWithCreatedNode'];
      if (typeof replaceNode === 'function') {
        await replaceNode({
          ...createdContainer,
          position: (current['position'] as { x: number; y: number } | undefined) ?? createdContainer.position,
          __focusOpen: current['__focusOpen'] === true
        });
        return;
      }

      this.data.data = {
        ...current,
        ...createdContainer,
        specificConfiguration: nextConfiguration,
        position: (current['position'] as { x: number; y: number } | undefined) ?? createdContainer.position,
        __containerAssigning: false,
        __containerAssignmentError: null
      };
      this.refreshParameterFields();
      this.updateCurrentFlowData(nextConfiguration);
      this.refreshView();
    } catch (error) {
      this.data.data = {
        ...current,
        __containerAssigning: false,
        __containerAssignmentError: error instanceof Error ? error.message : 'Container update failed'
      };
      this.refreshView();
    }
  }

  private updateCurrentFlowData(nextConfiguration: Record<string, unknown>) {
    const flow = this.editorState.currentFlow();
    const blockId = this.blockId;
    if (!flow || !blockId) return;

    const nextFlow: FlowData = {
      blocks: flow.data.blocks,
      containers: flow.data.containers.map((container) =>
        container.id === blockId
          ? {
            ...container,
            name: String(nextConfiguration['name'] ?? container.name),
            specificConfiguration: this.cloneConfigurationValue(nextConfiguration)
          }
          : container
      ),
      connections: flow.data.connections,
      dependencies: flow.data.dependencies ?? [],
      globalInputs: flow.data.globalInputs ?? []
    };

    this.editorState.updateData(nextFlow);
  }

  private cloneConfigurationValue<T>(value: T): T {
    if (typeof globalThis.structuredClone === 'function') {
      try {
        return globalThis.structuredClone(value);
      } catch {
        // Ignore non-cloneable runtime metadata.
      }
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private pruneInactiveConfiguration(config: Record<string, any>) {
    pruneInactiveSchemaConfiguration(
      config,
      this.containerFieldDefinitions.map((field) => field.path),
      (path, nextConfig) => this.isFieldVisible(path, nextConfig) && this.isFieldEnabled(path, nextConfig)
    );
  }

  private buildRetrieverContext(source: Record<string, unknown>, dependencies: SchemaRetrieverDependency[]) {
    return buildSchemaRetrieverContext(source, dependencies, {
      baseContext: this.withEditorFlowContext({}),
      resolveContextDependency: (key) => this.resolveEditorContextDependencyValue(key)
    });
  }

  private resolveEditorContextDependencyValue(contextKey: string): unknown {
    if (contextKey === 'flowId') {
      const flowId = this.editorState.currentFlow()?.id;
      return typeof flowId === 'string' && flowId.trim().length > 0 ? flowId.trim() : null;
    }
    if (contextKey === 'blockId') {
      return this.blockId;
    }
    if (contextKey === 'inputNames') {
      return (Array.isArray(this.data?.data?.inputs) ? this.data.data.inputs : [])
        .map((port: { name?: string }) => port?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
        .join(',');
    }
    if (contextKey === 'outputNames') {
      return (Array.isArray(this.data?.data?.outputs) ? this.data.data.outputs : [])
        .map((port: { name?: string }) => port?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
        .join(',');
    }
    return null;
  }

  private withEditorFlowContext(context?: Record<string, string>) {
    const nextContext = { ...(context ?? {}) };
    const flowId = this.editorState.currentFlow()?.id;
    if (typeof flowId === 'string' && flowId.trim().length > 0) {
      nextContext['flowId'] = flowId.trim();
    }
    return nextContext;
  }

  private async fetchRetrieverOptions(definition: ContainerFieldDefinition): Promise<NodeSettingOption[]> {
    const blockType = definition.retrieverBlockType ?? this.typeName;
    if (!blockType || !definition.retrieverKey) return [];

    const context = this.buildRetrieverContext(
      this.configuration ?? {},
      definition.retrieverDependsOn
    );

    if (definition.retrieverStructuredData) {
      const items = await firstValueFrom(
        this.fieldRetriever.retrieveItems<unknown>(
          blockType,
          definition.retrieverKey,
          context,
          definition.retrieverUrl
        )
      );
      return this.toStructuredRetrieverOptions(items ?? []);
    }

    const values = await firstValueFrom(
      this.fieldRetriever.retrieveValues(
        blockType,
        definition.retrieverKey,
        context,
        definition.retrieverUrl
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

  private refreshView() {
    queueMicrotask(() => {
      try {
        this.cdr.detectChanges();
      } catch {
        // Node may have been removed while async refresh was running.
      }
    });
  }

  private resolveFieldSchema(path: string): Record<string, any> | null {
    return resolveSchemaPath(this.containerSchema, path);
  }

}
