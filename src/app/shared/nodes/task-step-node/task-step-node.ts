import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, Input, inject } from '@angular/core';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { BlocksService } from '@services/blocks/blocks';
import {
  flattenPrimitiveValues,
  parentPath,
  pathToLabel,
  resolveSchemaRef,
  splitTemplatedTextParts,
  toStringOrNull,
  valueToDisplayString
} from '../node-utility';

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
  interactionModalOpen = false;

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
    this.name = toStringOrNull(config['name']) ?? this.name;
    const primitiveEntries = flattenPrimitiveValues(config);
    const contentEntry = this.pickMainContentEntry(primitiveEntries);

    this.mainContent = contentEntry
      ? {
          path: contentEntry.path,
          label: pathToLabel(contentEntry.path),
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
        label: pathToLabel(entry.path),
        value: valueToDisplayString(entry.value)
      }));

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

  stepStatus(): string {
    const status = this.blockConfiguration?.['__stepStatus'];
    return typeof status === 'string' ? status.toUpperCase() : '';
  }

  openInteractionModal(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.interactionModalOpen = true;
  }

  closeInteractionModal(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.interactionModalOpen = false;
  }

  private get blockConfiguration(): Record<string, any> | null {
    return this.data?.data?.specificConfiguration ?? null;
  }

  private get blockType(): string | null {
    const typeName = this.data?.data?.typeName;
    return typeof typeName === 'string' && typeName.length > 0 ? typeName : null;
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

  private getExecutionMessages(key: '__executionErrors' | '__executionWarnings'): string[] {
    const values = this.blockConfiguration?.[key];
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
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

    const blockType = await this.blocksService.getBlockType(type);
    this.blockSchema = (blockType?.schema ?? null) as Record<string, any> | null;
    this.variablePlaceholderPaths = this.extractVariablePlaceholderPaths(this.blockSchema);
    this.rebuildDisplayState();
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
