import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { EditorStateHolder } from '@stores/flow-editor';
import { FieldRetreiver as FieldRetriever } from '@services/retreiver/field-retreiver';
import { BlocksService } from '@services/blocks/blocks';
import { firstValueFrom } from 'rxjs';
import { ConditionalRequiredField, extractSchemaRequirements, SchemaRequirements } from '../schema-requirements';
import {
  flattenPrimitiveValues,
  parentPath,
  pathToLabel,
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
    placeholder?: string;
    tip?: string;
    rows?: number;
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
    this.localEditorOpen = true;
  }

  async openParameterEditor(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const definition = this.editableFieldDefinitions.find((field) => field.path === path);
    if (!definition) return;

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
    this.localEditorOpen = true;

    if (definition.retrieverKey) {
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
      const parsedValue = this.parseEditorValue(this.localEditorValue, this.localEditorType);
      this.setByPath(config, this.localEditorPath, parsedValue);
    }

    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
    this.closeSimpleParamEditor();
  }

  async openMainContentEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const contentKey = this.mainContentKey();
    if (!contentKey) return;

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
    return this.isHumanNode() ? 'Human Task' : 'LLM Node';
  }

  mainContentLabel(): string {
    const contentKey = this.mainContentKey();
    if (!contentKey) return 'Content';
    return pathToLabel(contentKey);
  }

  hasMainContent(): boolean {
    return !!this.mainContentKey();
  }

  mainContentParts(): { text: string; isDynamicInput: boolean }[] {
    const contentKey = this.mainContentKey();
    if (!contentKey) return [];
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
    this.editorState.updateData(flow.data);
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
    this.setByPath(config, path, String(result[path] ?? ''));
    this.refreshParameterFields();
    this.refreshValidationState();
    this.markFlowDirty();
  }

  private buildEditableFieldDefinitions(schema: Record<string, any> | null): EditableFieldDefinition[] {
    if (!schema) return [];

    const definitions: EditableFieldDefinition[] = [];
    const seen = new Set<string>();
    const contentKey = this.mainContentKey();

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

        if (key === 'type' || key === 'name' || key.startsWith('__')) continue;
        if (contentKey && path === contentKey) continue;
        if (seen.has(path)) continue;

        seen.add(path);
        definitions.push({
          path,
          label: pathToLabel(path),
          type: this.toFieldType(childResolved?.type),
          retrieverBlockType: this.toRetrieverBlockType(childResolved),
          retrieverKey: this.toRetrieverKey(childResolved),
          retrieverDependsOn: this.toRetrieverDependsOn(childResolved, pathPrefix),
          ui: this.toFieldUiMeta(childResolved)
        });
      }
    };

    walk(schema, '');
    return definitions;
  }

  private toFieldUiMeta(schema: Record<string, any> | null | undefined) {
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

    return {
      widget: normalizedWidget,
      acceptVariableAsPlaceholder,
      placeholder,
      tip,
      rows
    };
  }

  private getFieldUiMeta(path: string) {
    return this.toFieldUiMeta(this.resolveFieldSchema(path));
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
      });

      for (const field of orderedFields) {
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
      return;
    }

    const contentKey = this.mainContentKey();
    const fallbackFields = flattenPrimitiveValues(config)
      .filter((entry) => entry.path !== 'name' && entry.path !== 'type' && entry.path !== contentKey)
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

  private mainContentKey(): string | null {
    const config = this.blockConfiguration ?? {};
    if (Object.prototype.hasOwnProperty.call(config, 'actionDescription')) return 'actionDescription';
    if (Object.prototype.hasOwnProperty.call(config, 'prompt')) return 'prompt';

    if (this.blockSchema?.['properties'] && typeof this.blockSchema['properties'] === 'object') {
      const props = this.blockSchema['properties'] as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(props, 'actionDescription')) return 'actionDescription';
      if (Object.prototype.hasOwnProperty.call(props, 'prompt')) return 'prompt';
    }

    return null;
  }

  private getByPath(source: Record<string, any>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc == null || typeof acc !== 'object') return undefined;
      return (acc as Record<string, unknown>)[key];
    }, source);
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
    ].filter((field) => field.path !== 'name');

    this.missingRequiredParams = requiredFields
      .filter((field) => this.isMissingValue(this.getByPath(config, field.path)))
      .map((field) => field.label);

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
}
