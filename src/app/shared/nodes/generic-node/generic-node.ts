import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
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
};

type EditableFieldGroupView = {
  key: string;
  legend: string;
  fields: EditableFieldView[];
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

  missingRequiredParams: string[] = [];
  private blockSchema: Record<string, any> | null = null;
  private editableFieldDefinitions: EditableFieldDefinition[] = [];
  private schemaRequirements: SchemaRequirements = { required: [], conditional: [] };
  private conditionalRequiredByPath = new Map<string, boolean>();
  private refreshingConditionalRequirements = false;

  ngOnInit() {
    this.outputs = [];
    this.inputs = [];
    this.parameterFields = [];
    this.parameterFieldGroups = [];

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

  async openMainContentEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const contentKey = this.mainContentKey();
    if (!contentKey) return;
    if (!this.isPathVisible(contentKey)) return;

    const contentLabel = this.mainContentLabel();
    const ui = this.getFieldUiMeta(contentKey);
    const currentValue = String(this.getByPath(this.blockConfiguration ?? {}, contentKey) ?? '');
    await this.openTextareaEditor(contentKey, contentLabel, currentValue, ui);
  }

  async confirmDelete(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const confirmed = window.confirm('Do you want to delete this node from the flow?');
    if (!confirmed) return;

    const deleteNode = this.data?.data?.deleteNode;
    if (typeof deleteNode === 'function') {
      await deleteNode();
    }
  }

  isHumanNode(): boolean {
    return this.blockType === 'HumanInteractionBlock';
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

  mainContentLabel(): string {
    const contentKey = this.mainContentKey();
    if (!contentKey) return 'Content';
    return pathToLabel(contentKey);
  }

  hasMainContent(): boolean {
    const contentKey = this.mainContentKey();
    return !!contentKey && this.isPathVisible(contentKey);
  }

  mainContentParts(): { text: string; isDynamicInput: boolean }[] {
    const contentKey = this.mainContentKey();
    if (!contentKey || !this.isPathVisible(contentKey)) return [];
    const content = toStringOrNull(this.getByPath(this.blockConfiguration ?? {}, contentKey));
    if (!content) return [];
    const ui = this.getFieldUiMeta(contentKey);
    if (ui.widget === 'textarea' && ui.acceptVariableAsPlaceholder) {
      return splitTemplatedTextParts(content);
    }
    return [{ text: content, isDynamicInput: false }];
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
    this.editorState.updateData(this.cloneFlowData(flow.data));
  }

  private async loadSchemaContext() {
    const type = this.blockType;
    if (!type) return;

    const blockType = await this.blocksService.getBlockType(type);
    this.blockSchema = (blockType?.schema ?? null) as Record<string, any> | null;
    this.schemaRequirements = extractSchemaRequirements(this.blockSchema);
    this.editableFieldDefinitions = this.buildEditableFieldDefinitions(this.blockSchema);

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
          retrieverDependsOn: this.toRetrieverDependsOn(childResolved, pathPrefix),
          ui: childUi
        });
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
        this.fieldRetriever.retrieveValues(blockType, definition.retrieverKey, context)
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
    const contentKey = this.mainContentKey();
    const grouped = new Map<string, EditableFieldView[]>();
    const rootFields: EditableFieldView[] = [];

    if (this.editableFieldDefinitions.length) {
      const orderedFields = this.editableFieldDefinitions.map((definition) => {
        const value = this.getByPath(config, definition.path);
        return {
          path: definition.path,
          label: definition.label,
          value: valueToDisplayString(value)
        };
      }).filter((field) => field.path !== contentKey)
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
      .filter((entry) => entry.path !== 'name' && entry.path !== 'type' && entry.path !== contentKey)
      .filter((entry) => this.isPathVisible(entry.path))
      .map((entry) => ({
        path: entry.path,
        label: pathToLabel(entry.path),
        value: valueToDisplayString(entry.value)
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

  private mainContentKey(): string | null {
    const preferredPath = this.editableFieldDefinitions.find((field) =>
      field.ui.widget === 'textarea'
      && field.ui.acceptVariableAsPlaceholder
      && this.isPathVisible(field.path)
    )?.path;
    if (preferredPath) {
      return preferredPath;
    }

    const schemaCandidates = this.findMainContentCandidatePaths(this.blockSchema);
    for (const candidate of schemaCandidates) {
      if (this.isPathVisible(candidate)) return candidate;
    }

    return null;
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
        this.fieldRetriever.isFieldRequired(retrieverBlockType, field.retrieverKey, context)
      );
    } catch {
      return false;
    }
  }

  private refreshView() {
    queueMicrotask(() => {
      try {
        this.cdr.detectChanges();
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
