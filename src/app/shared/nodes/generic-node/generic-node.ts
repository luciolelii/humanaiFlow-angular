import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { FlowData } from '@models/flow';
import {
  NodeSettingField,
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
  getValueByPath,
  parentPath,
  pathToLabel,
  readUiConditionRule,
  readUiGroup,
  resolveSchemaRef,
  splitTemplatedTextParts,
  toStringOrNull,
  valueToDisplayString
} from '../node-utility';

type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'unknown';

type RetrieverDependency = {
  key: string;
  path: string;
};

type EditableFieldDefinition = {
  path: string;
  label: string;
  type: FieldType;
  retrieverBlockType: string | null;
  retrieverKey: string | null;
  retrieverUrl: string | null;
  retrieverDependsOn: RetrieverDependency[];
  ui: {
    widget: 'textarea' | null;
    acceptVariableAsPlaceholder: boolean;
    structural: boolean;
    structuralReason?: string;
    placeholder?: string;
    tip?: string;
    rows?: number;
    visibleWhen: UiConditionRule[];
    group: string | null;
  };
};

type EditableFieldView = {
  path: string;
  label: string;
  value: string;
  wide: boolean;
};

type ArrayFieldDefinition = {
  path: string;
  label: string;
  itemSchema: Record<string, any> | null;
  ui: {
    structural: boolean;
    visibleWhen: UiConditionRule[];
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
  parts: { text: string; isDynamicInput: boolean }[];
};

@Component({
  selector: 'app-generic-node',
  imports: [CommonModule, FormsModule, ReteModule],
  templateUrl: './generic-node.html',
  styleUrl: './generic-node.css',
  host: {
    'data-testid': 'node'
  }
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
    return this.data.selected;
  }

  outputs: { key: string; socket: ClassicPreset.Socket }[] = [];
  inputs: { key: string; socket: ClassicPreset.Socket }[] = [];
  parameterFields: EditableFieldView[] = [];
  parameterFieldGroups: EditableFieldGroupView[] = [];
  richContentFields: RichContentView[] = [];
  arrayFields: ArrayFieldView[] = [];
  name = 'noName';

  localEditorOpen = false;
  localEditorPath: string | null = null;
  localEditorLabel = '';
  localEditorValue = '';
  localEditorOptions: string[] = [];
  localEditorLoading = false;
  localEditorHasRetriever = false;
  localEditorType: FieldType = 'string';
  localEditorMaxLength: number | null = null;
  deleteConfirmOpen = false;

  missingRequiredParams: string[] = [];
  private blockSchema: Record<string, any> | null = null;
  private editableFieldDefinitions: EditableFieldDefinition[] = [];
  private arrayFieldDefinitions: ArrayFieldDefinition[] = [];
  private schemaRequirements: SchemaRequirements = { required: [], conditional: [] };
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
      this.outputs.push({ key, socket: (output as any).socket });
    });

    Object.entries(this.data.inputs).forEach(([key, input]) => {
      this.inputs.push({ key, socket: (input as any).socket });
    });

    const config = this.ensureBlockConfiguration();

    this.name = toStringOrNull(config['name']) || this.name;

    this.refreshValidationState();
    this.refreshParameterFields();
    void this.loadSchemaContext();
  }

  ngAfterViewInit() {
    this.rendered();
  }

  async openNameEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    this.localEditorPath = 'name';
    this.localEditorLabel = 'Name';
    this.localEditorType = 'string';
    this.localEditorMaxLength = 20;
    this.localEditorValue = this.name ?? '';
    this.localEditorOptions = [];
    this.localEditorLoading = false;
    this.localEditorHasRetriever = false;
    this.localEditorOpen = true;
  }

  async openParameterEditor(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const definition = this.editableFieldDefinitions.find((field) => field.path === path);
    if (!definition) return;
    if (!this.isFieldVisible(definition)) return;

    if (definition.ui.widget === 'textarea') {
      const currentValue = this.valueToEditorString(
        this.getByPath(this.blockConfiguration ?? {}, definition.path),
        definition.type
      );
      await this.openTextareaEditor(definition.path, definition.label, currentValue, definition.ui);
      return;
    }

    this.localEditorPath = definition.path;
    this.localEditorLabel = definition.label;
    this.localEditorType = definition.type;
    this.localEditorMaxLength = null;
    this.localEditorValue = this.valueToEditorString(this.getByPath(this.blockConfiguration ?? {}, definition.path), definition.type);
    this.localEditorOptions = [];
    this.localEditorLoading = !!definition.retrieverKey;
    this.localEditorHasRetriever = !!definition.retrieverKey;
    this.localEditorOpen = true;

    if (definition.retrieverKey) {
      const missingDependencies = definition.retrieverDependsOn
        .filter((dep) => {
          const value = this.getByPath(this.blockConfiguration ?? {}, dep.path);
          return this.isMissingValue(value);
        })
        .map((dep) => pathToLabel(dep.path));

      if (missingDependencies.length > 0) {
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
  }

  saveSimpleParamEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    if (!this.localEditorPath) return;
    const config = this.ensureBlockConfiguration();

    if (this.localEditorPath === 'name') {
      const nameValue = this.localEditorValue.trim().slice(0, 20);
      config['name'] = nameValue;
      this.name = nameValue || this.name;
    } else {
      const previousValue = this.getByPath(config, this.localEditorPath);
      const parsedValue = this.parseEditorValue(this.localEditorValue, this.localEditorType);
      this.setByPath(config, this.localEditorPath, parsedValue);
      if (!this.areValuesEqual(previousValue, parsedValue)) {
        this.resetDependentRetrieverFields(config, this.localEditorPath);
        if (this.isStructuralField(this.localEditorPath)) {
          this.markBlockForServerRecreate();
        }
      }
    }

    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
    this.maybeCreateBlockOnServer();
    this.closeSimpleParamEditor();
  }

  async openMainContentEditor(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    if (!this.isPathVisible(path)) return;

    const contentLabel = pathToLabel(path);
    const ui = this.getFieldUiMeta(path);
    const currentValue = String(this.getByPath(this.blockConfiguration ?? {}, path) ?? '');
    await this.openTextareaEditor(path, contentLabel, currentValue, ui);
  }

  async confirmDelete(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
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

  isHumanNode(): boolean {
    return this.blockType === 'HumanInteractionBlock';
  }

  isConditionalNode(): boolean {
    return this.blockType === 'ConditionalBlock';
  }

  nodeTitle(): string {
    const type = this.blockType;
    if (!type) return 'Node';
    if (type === 'HumanInteractionBlock') return 'Human Task';
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
    const type = this.blockType;
    if (!type) return;

    const blockType = await this.blocksService.getBlockType(type);
    this.blockSchema = (blockType?.schema ?? null) as Record<string, any> | null;
    this.schemaRequirements = extractSchemaRequirements(this.blockSchema);
    this.editableFieldDefinitions = this.buildEditableFieldDefinitions(this.blockSchema);
    this.arrayFieldDefinitions = this.buildArrayFieldDefinitions(this.blockSchema);

    await this.refreshConditionalRequirements();
    this.refreshParameterFields();
    this.refreshValidationState();
    this.maybeCreateBlockOnServer();
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
      inheritedUi?: { visibleWhen: UiConditionRule[]; group: string | null }
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
            group: childUi.group
          });
          continue;
        }

        if (key === 'type' || key === 'name' || key.startsWith('__')) continue;
        if (seen.has(path)) continue;

        seen.add(path);
        definitions.push({
          path,
          label: pathToLabel(path),
          type: this.toFieldType(childResolved?.type),
          retrieverBlockType: this.toRetrieverBlockType(childResolved),
          retrieverKey: this.toRetrieverKey(childResolved),
          retrieverUrl: this.toRetrieverUrl(childResolved),
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
      inheritedUi?: { visibleWhen: UiConditionRule[]; group: string | null }
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
            label: pathToLabel(path),
            itemSchema: this.resolveArrayItemSchema(childResolved, schema),
            ui: {
              structural: childUi.structural,
              visibleWhen: childUi.visibleWhen,
              group: childUi.group
            }
          });
          continue;
        }

        const hasChildren = !!childResolved?.properties || childResolved?.type === 'object';
        if (hasChildren) {
          walk(childResolved as Record<string, any>, path, {
            visibleWhen: childUi.visibleWhen,
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
    inheritedUi?: { visibleWhen: UiConditionRule[]; group: string | null }
  ) {
    const rawWidget = typeof schema?.['x-ui-widget'] === 'string'
      ? String(schema['x-ui-widget']).toLowerCase().trim()
      : '';
    const normalizedWidget: 'textarea' | null =
      rawWidget === 'textarea' || rawWidget === 'text-area' ? 'textarea' : null;
    const placeholder = typeof schema?.['x-ui-placeholder'] === 'string'
      ? String(schema['x-ui-placeholder'])
      : undefined;
    const tip = typeof schema?.['x-ui-tip'] === 'string'
      ? String(schema['x-ui-tip'])
      : undefined;
    const rowsRaw = schema?.['x-ui-rows'];
    const rows = typeof rowsRaw === 'number' && Number.isFinite(rowsRaw) && rowsRaw > 0
      ? Math.trunc(rowsRaw)
      : undefined;
    const acceptVariableAsPlaceholder = schema?.['x-ui-accept-variable-as-placeholder'] === true;
    const structural = schema?.['x-ui-structural'] === true;
    const structuralReason = typeof schema?.['x-ui-structural-reason'] === 'string'
      ? String(schema['x-ui-structural-reason'])
      : undefined;
    const visibleWhen = readUiConditionRule(schema?.['x-ui-visible-when']);
    const group = readUiGroup(schema?.['x-ui-group']) ?? inheritedUi?.group ?? null;

    return {
      widget: normalizedWidget,
      acceptVariableAsPlaceholder,
      structural,
      structuralReason,
      placeholder,
      tip,
      rows,
      visibleWhen: [
        ...(inheritedUi?.visibleWhen ?? []),
        ...(visibleWhen ? [visibleWhen] : [])
      ],
      group
    };
  }

  private getFieldUiMeta(path: string) {
    const root = this.blockSchema;
    if (!root) return this.toFieldUiMeta(null);

    let current: Record<string, any> | null = root;
    let inheritedUi = { visibleWhen: [] as UiConditionRule[], group: null as string | null };

    for (const segment of path.split('.')) {
      if (!current) return this.toFieldUiMeta(null, inheritedUi);
      const resolved = resolveSchemaRef(current, root);
      const properties = resolved?.properties as Record<string, unknown> | undefined;
      if (!properties || !properties[segment]) return this.toFieldUiMeta(null, inheritedUi);
      current = resolveSchemaRef(properties[segment] as Record<string, any>, root);
      const nextUi = this.toFieldUiMeta(current, inheritedUi);
      inheritedUi = {
        visibleWhen: nextUi.visibleWhen,
        group: nextUi.group
      };
    }

    return this.toFieldUiMeta(current, inheritedUi);
  }

  private isStructuralField(path: string): boolean {
    return this.getFieldUiMeta(path).structural;
  }

  private resolveFieldSchema(path: string): Record<string, any> | null {
    const root = this.blockSchema;
    if (!root) return null;

    let current: Record<string, any> | null = root;
    for (const segment of path.split('.')) {
      if (!current) return null;
      const resolved = resolveSchemaRef(current, root);
      const properties = resolved?.properties as Record<string, unknown> | undefined;
      if (!properties || !properties[segment]) return null;
      current = resolveSchemaRef(properties[segment] as Record<string, any>, root);
    }

    return current;
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
    return this.parseRetrieverUrl(schema['x-retriever-url'])?.blockType ?? null;
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
    const retrieverIndex = parts.findIndex((part) => part === 'retriever');
    if (retrieverIndex < 0 || parts.length < retrieverIndex + 3) return null;

    const blockType = parts[retrieverIndex + 1];
    const key = parts[retrieverIndex + 2];
    if (!blockType || !key) return null;

    return { blockType, key };
  }

  private toRetrieverDependsOn(schema: Record<string, any> | null | undefined, pathPrefix: string): RetrieverDependency[] {
    if (!schema || typeof schema !== 'object') return [];

    const raw = Array.isArray(schema['x-retriever-depends-on'])
      ? (schema['x-retriever-depends-on'] as unknown[])
      : [];

    return raw
      .filter((dep): dep is string => typeof dep === 'string' && dep.length > 0)
      .map((dep) => ({
        key: dep,
        path: pathPrefix ? `${pathPrefix}.${dep}` : dep
      }));
  }

  private async loadLocalEditorOptions(definition: EditableFieldDefinition) {
    const blockType = definition.retrieverBlockType ?? this.blockType;
    if (!blockType || !definition.retrieverKey) {
      this.localEditorLoading = false;
      return;
    }

    const context: Record<string, string> = {};
    for (const dep of definition.retrieverDependsOn) {
      const value = this.getByPath(this.blockConfiguration ?? {}, dep.path);
      context[dep.key] = value == null ? '' : String(value);
    }

    try {
      const options = await firstValueFrom(
        this.fieldRetriever.retrieveValues(
          blockType,
          definition.retrieverKey,
          definition.retrieverDependsOn.length ? context : undefined,
          definition.retrieverUrl
        )
      );
      this.localEditorOptions = options ?? [];
    } catch {
      this.localEditorOptions = [];
    } finally {
      this.localEditorLoading = false;
    }
  }

  private refreshParameterFields() {
    const config = this.blockConfiguration ?? {};
    const richContentPaths = new Set(this.richContentPaths());
    const grouped = new Map<string, EditableFieldView[]>();
    const rootFields: EditableFieldView[] = [];

    this.richContentFields = this.richContentPaths()
      .filter((path) => this.isPathVisible(path))
      .map((path) => ({
        path,
        label: pathToLabel(path),
        parts: this.toRichContentParts(path)
      }));

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
          value: valueToDisplayString(value),
          wide: this.shouldRenderWideField(definition.label, definition.ui.widget === 'textarea')
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
        legend: key.startsWith('group:') ? key.slice('group:'.length) : pathToLabel(key),
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
        label: pathToLabel(entry.path),
        value: valueToDisplayString(entry.value),
        wide: this.shouldRenderWideField(pathToLabel(entry.path), false)
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
      legend: pathToLabel(key),
      fields
    }));

    this.refreshView();
  }

  async addArrayItem(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    await this.openArrayItemEditor(path, null);
  }

  async editArrayItem(path: string, index: number, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    await this.openArrayItemEditor(path, index);
  }

  removeArrayItem(path: string, index: number, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const config = this.ensureBlockConfiguration();
    const current = this.getByPath(config, path);
    const items = Array.isArray(current) ? [...current] : [];
    if (index < 0 || index >= items.length) return;

    items.splice(index, 1);
    this.setByPath(config, path, items);
    if (this.isStructuralField(path)) {
      this.markBlockForServerRecreate();
    }
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
    if (index == null) {
      items.push(nextItem);
    } else {
      items[index] = nextItem;
    }

    this.setByPath(config, path, items);
    if (this.isStructuralField(path)) {
      this.markBlockForServerRecreate();
    }
    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
    this.maybeCreateBlockOnServer();
  }

  private async buildArrayItemDialog(
    definition: ArrayFieldDefinition,
    item: Record<string, unknown>,
    index: number | null
  ) {
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
      if (key === 'type' || key.startsWith('__')) continue;

      const propertySchema = resolveSchemaRef(rawPropertySchema as Record<string, any>, schemaRoot);
      if (this.hasDynamicSchema(propertySchema)) {
        const dynamicFields = await this.buildDynamicSchemaFields(key, propertySchema, item);
        fields.push(...dynamicFields.fields);
        Object.assign(initial, dynamicFields.initial);
        continue;
      }

      const label = pathToLabel(key);
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
        tip: typeof propertySchema?.['x-ui-tip'] === 'string' ? String(propertySchema['x-ui-tip']) : undefined
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
      initial
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
      if (key === 'type' || key.startsWith('__')) continue;

      const propertySchema = resolveSchemaRef(rawPropertySchema as Record<string, any>, schemaRoot);
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
      if (key === 'type' || key.startsWith('__')) continue;
      const propertySchema = resolveSchemaRef(rawPropertySchema as Record<string, any>, schemaRoot);
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
          label: pathToLabel(baseKey),
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
          label: pathToLabel(baseKey),
          type: 'display',
          readonly: true
        }],
        initial: {
          [`${baseKey}.__hint`]: 'No dynamic schema available'
        }
      };
    }

    return this.buildDialogFieldsFromSchema(baseKey, pathToLabel(baseKey), resolvedSchema, item[baseKey]);
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
      titlePrefix: string
    ) => {
      const resolved = resolveSchemaRef(node, schema);
      const properties = resolved?.['properties'] as Record<string, any> | undefined;
      if (!properties) return;

      for (const [childKey, rawChildSchema] of Object.entries(properties)) {
        if (childKey === 'type' || childKey.startsWith('__')) continue;

        const childSchema = resolveSchemaRef(rawChildSchema as Record<string, any>, schema);
        const nextPath = `${pathPrefix}.${childKey}`;
        const nextLabel = `${titlePrefix} ${pathToLabel(childKey)}`;
        const currentNestedValue = getValueByPath(currentRecord, nextPath.slice(`${keyPrefix}.`.length));

        const hasChildren = !!childSchema?.['properties'] || childSchema?.type === 'object';
        if (hasChildren) {
          await walk(childSchema as Record<string, any>, nextPath, nextLabel);
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
          tip: typeof childSchema?.['x-ui-tip'] === 'string' ? String(childSchema['x-ui-tip']) : undefined
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

  private async loadNodeSettingOptions(
    propertySchema: Record<string, any>,
    item: Record<string, unknown>,
    pathPrefix: string
  ): Promise<NodeSettingOption[] | undefined> {
    const retrieverKey = this.toRetrieverKey(propertySchema);
    const retrieverBlockType = this.toRetrieverBlockType(propertySchema);
    if (!retrieverKey || !retrieverBlockType) return undefined;

    const retrieverDependsOn = this.toRetrieverDependsOn(propertySchema, pathPrefix);
    const retrieverContext: Record<string, string> = {};
    for (const dep of retrieverDependsOn) {
      const depValue = getValueByPath(item as Record<string, any>, dep.path);
      retrieverContext[dep.key] = depValue == null ? '' : String(depValue);
    }

    try {
      const values = await firstValueFrom(
        this.fieldRetriever.retrieveValues(
          retrieverBlockType,
          retrieverKey,
          retrieverDependsOn.length ? retrieverContext : undefined,
          this.toRetrieverUrl(propertySchema)
        )
      );
      return values.map((value) => ({ label: value, value }));
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
    const preferredPaths = this.editableFieldDefinitions
      .filter((field) => field.ui.widget === 'textarea' && field.ui.acceptVariableAsPlaceholder)
      .map((field) => field.path);
    if (preferredPaths.length) {
      return preferredPaths;
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
        const acceptsVariable = childResolved?.['x-ui-accept-variable-as-placeholder'] === true;
        if (!isTextarea || !acceptsVariable || seen.has(path)) continue;

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
      .filter((field) => this.isMissingValue(this.getByPath(config, field.path)));

    this.missingRequiredParams = missingFields.map((field) => field.label);

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
    const retrieverBlockType = field.retrieverBlockType ?? blockType;
    const context: Record<string, string> = {};
    for (const dep of field.dependsOn) {
      const value = this.getByPath(this.blockConfiguration ?? {}, dep.path);
      context[dep.key] = typeof value === 'string' ? value : '';
    }

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
      return globalThis.structuredClone(value);
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
    }).pipe(
      take(1)
    ).subscribe({
      next: (createdBlock) => {
        const current = (this.data?.data ?? {}) as Record<string, unknown>;
        const replaceNode = current['replaceWithCreatedBlock'];
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

  private isFieldVisible(field: EditableFieldDefinition): boolean {
    return this.isPathVisible(field.path);
  }

  private isFieldConditionSatisfied(path: string): boolean {
    const ui = this.getFieldUiMeta(path);
    return ui.visibleWhen.every((rule) =>
      evaluateUiConditionRule(rule, this.blockConfiguration, (fieldPath) => this.resolveFieldSchema(fieldPath))
    );
  }
}
