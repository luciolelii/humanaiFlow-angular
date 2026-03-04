import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, Input, inject } from '@angular/core';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { BlocksService } from '@services/blocks/blocks';

type DisplayField = {
  path: string;
  label: string;
  value: string;
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
  private cdr = inject(ChangeDetectorRef);

  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  @HostBinding('class.selected') get selected() {
    return this.data.selected;
  }

  outputs: { key: string; socket: ClassicPreset.Socket }[] = [];
  inputs: { key: string; socket: ClassicPreset.Socket }[] = [];
  parameterFields: DisplayField[] = [];
  parameterFieldGroups: DisplayFieldGroup[] = [];

  name = 'Step';
  mainContent: MainContentView | null = null;

  private blockSchema: Record<string, any> | null = null;
  private variablePlaceholderPaths = new Set<string>();

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

    this.rebuildDisplayState();
    void this.loadSchemaContext();
  }

  private rebuildDisplayState() {
    const config = this.blockConfiguration ?? {};
    this.name = this.toStringOrNull(config['name']) ?? this.name;
    const primitiveEntries = this.flattenPrimitiveValues(config);
    const contentEntry = this.pickMainContentEntry(primitiveEntries);

    this.mainContent = contentEntry
      ? {
          path: contentEntry.path,
          label: this.pathToLabel(contentEntry.path),
          parts: this.toMainContentParts(contentEntry.path, String(contentEntry.value))
        }
      : null;

    const grouped = new Map<string, DisplayField[]>();
    const rootFields: DisplayField[] = [];
    const orderedFields = primitiveEntries
      .filter((entry) => !['name', 'type'].includes(entry.path))
      .filter((entry) => entry.path !== contentEntry?.path)
      .map((entry) => ({
        path: entry.path,
        label: this.pathToLabel(entry.path),
        value: this.valueToDisplayString(entry.value)
      }));

    for (const field of orderedFields) {
      const parentPath = this.parentPath(field.path);
      if (!parentPath) {
        rootFields.push(field);
        continue;
      }
      if (!grouped.has(parentPath)) {
        grouped.set(parentPath, []);
      }
      grouped.get(parentPath)!.push(field);
    }

    this.parameterFields = rootFields;
    this.parameterFieldGroups = Array.from(grouped.entries()).map(([key, fields]) => ({
      key,
      legend: this.pathToLabel(key),
      fields
    }));

    this.refreshView();
  }

  ngAfterViewInit() {
    this.rendered();
  }

  isHumanNode(): boolean {
    return this.blockType === 'HumanInteractionBlock';
  }

  nodeTitle(): string {
    const type = this.blockType;
    if (!type) return 'Task Step';
    return type
      .replace(/Block$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();
  }

  hasMainContent(): boolean {
    return (this.mainContent?.parts.length ?? 0) > 0;
  }

  mainContentLabel(): string {
    return this.mainContent?.label ?? 'Content';
  }

  mainContentParts(): { text: string; isDynamicInput: boolean }[] {
    return this.mainContent?.parts ?? [];
  }

  formatDynamicInputToken(token: string): string {
    const match = token.match(/^\$\{\{\s*([^}]+?)\s*\}\}$/);
    return match ? match[1] : token;
  }

  executionInputTooltip(inputName: string): string | null {
    const values = this.blockConfiguration?.['__executionInputs'] as Record<string, unknown> | undefined;
    if (!values || !Object.prototype.hasOwnProperty.call(values, inputName)) return null;

    const value = values[inputName];
    if (value === undefined) return null;
    if (typeof value === 'string') return value.trim().length > 0 ? value : null;

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
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

  private get blockConfiguration(): Record<string, any> | null {
    return this.data?.data?.specificConfiguration ?? null;
  }

  private get blockType(): string | null {
    const typeName = this.data?.data?.typeName;
    return typeof typeName === 'string' && typeName.length > 0 ? typeName : null;
  }

  private toStringOrNull(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    return null;
  }

  private flattenPrimitiveValues(source: Record<string, any>, prefix = ''): Array<{ path: string; value: unknown }> {
    const entries: Array<{ path: string; value: unknown }> = [];
    for (const [key, value] of Object.entries(source ?? {})) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (key.startsWith('__')) continue;
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        entries.push(...this.flattenPrimitiveValues(value as Record<string, any>, path));
      } else {
        entries.push({ path, value });
      }
    }
    return entries;
  }

  private pickMainContentEntry(entries: Array<{ path: string; value: unknown }>) {
    const candidates = entries
      .filter((entry) => !['name', 'type'].includes(entry.path))
      .filter((entry) => typeof entry.value === 'string')
      .map((entry) => ({ ...entry, text: String(entry.value).trim() }))
      .filter((entry) => entry.text.length > 0);

    if (!candidates.length) return null;

    const placeholderCandidates = candidates.filter((entry) =>
      this.variablePlaceholderPaths.has(entry.path)
    );
    const scope = placeholderCandidates.length ? placeholderCandidates : candidates;

    scope.sort((a, b) => {
      if (b.text.length !== a.text.length) return b.text.length - a.text.length;
      return a.path.localeCompare(b.path);
    });

    const chosen = scope[0];
    return { path: chosen.path, value: chosen.text };
  }

  private valueToDisplayString(value: unknown): string {
    if (value == null) return '-';
    if (typeof value === 'string') return value.trim().length ? value : '-';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '-';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private pathToLabel(path: string): string {
    const lastSegment = path.split('.').at(-1) ?? path;
    return lastSegment
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }

  private parentPath(path: string): string | null {
    const index = path.lastIndexOf('.');
    if (index <= 0) return null;
    return path.slice(0, index);
  }

  private getExecutionMessages(key: '__executionErrors' | '__executionWarnings'): string[] {
    const values = this.blockConfiguration?.[key];
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }

  private toMainContentParts(path: string, value: string): { text: string; isDynamicInput: boolean }[] {
    if (this.variablePlaceholderPaths.has(path)) {
      return this.splitTemplatedTextParts(value);
    }
    return [{ text: value, isDynamicInput: false }];
  }

  private splitTemplatedTextParts(text: string | null): { text: string; isDynamicInput: boolean }[] {
    if (!text) return [];

    const parts: { text: string; isDynamicInput: boolean }[] = [];
    const re = /\$\{\{[^}]+\}\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          text: text.slice(lastIndex, match.index),
          isDynamicInput: false
        });
      }

      parts.push({
        text: match[0],
        isDynamicInput: true
      });
      lastIndex = re.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push({
        text: text.slice(lastIndex),
        isDynamicInput: false
      });
    }

    return parts;
  }

  private async loadSchemaContext() {
    const type = this.blockType;
    if (!type) return;

    const blockType = await this.blocksService.getBlockType(type);
    this.blockSchema = (blockType?.schema ?? null) as Record<string, any> | null;
    this.variablePlaceholderPaths = this.extractVariablePlaceholderPaths(this.blockSchema);
    this.rebuildDisplayState();
  }

  private extractVariablePlaceholderPaths(schema: Record<string, any> | null): Set<string> {
    const paths = new Set<string>();
    if (!schema) return paths;

    const walk = (node: Record<string, any>, pathPrefix: string) => {
      const resolved = this.resolveRef(node, schema);
      if (!resolved || typeof resolved !== 'object') return;

      const properties = resolved.properties as Record<string, any> | undefined;
      if (!properties) return;

      for (const [key, childSchema] of Object.entries(properties)) {
        const childResolved = this.resolveRef(childSchema as Record<string, any>, schema);
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

  private resolveRef(node: Record<string, any>, root: Record<string, any>) {
    if (!node || typeof node !== 'object') return node;
    const ref = node['$ref'];
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return node;

    const path = ref.slice(2).split('/');
    let current: any = root;
    for (const segment of path) {
      current = current?.[segment];
      if (current == null) return node;
    }
    return current;
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

}
