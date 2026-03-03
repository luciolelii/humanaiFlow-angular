import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { EditorStateHolder } from '@stores/flow-editor';
import { FieldRetreiver } from '@services/retreiver/field-retreiver';
import { BlocksService } from '@services/blocks/blocks';
import { firstValueFrom } from 'rxjs';
import { ConditionalRequiredField, extractSchemaRequirements, SchemaRequirements } from '../schema-requirements';

@Component({
  selector: 'app-human-interaction-node',
  imports: [CommonModule, FormsModule, ReteModule],
  templateUrl: './human-interaction.html',
  styleUrl: './human-interaction.css',
  host: {
    'data-testid': 'node'
  }
})
export class HumanInteractionNodeComponent {
  private settingsDialog = inject(NodeSettingsDialogService);
  private editorState = inject(EditorStateHolder);
  private fieldRetreiver = inject(FieldRetreiver);
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

  name = 'Human Interaction';
  actionDescription = '';
  provider: string | null = null;
  model: string | null = null;
  authorization: string | null = null;
  localEditorOpen = false;
  localEditorKey: 'provider' | 'model' | 'authorization' | 'name' | null = null;
  localEditorLabel = '';
  localEditorValue = '';
  localEditorOptions: string[] = [];
  localEditorLoading = false;
  missingRequiredParams: string[] = [];
  private schemaRequirements: SchemaRequirements = { required: [], conditional: [] };
  private conditionalRequiredByPath = new Map<string, boolean>();
  private refreshingConditionalRequirements = false;

  ngOnInit() {
    this.outputs = [];
    this.inputs = [];

    for (const [key, output] of Object.entries(this.data.outputs ?? {})) {
      this.outputs.push({ key, socket: (output as any).socket });
    }

    for (const [key, input] of Object.entries(this.data.inputs ?? {})) {
      this.inputs.push({ key, socket: (input as any).socket });
    }

    const config = this.data?.data?.specificConfiguration ?? {};
    this.name = (config?.name as string) || this.name;
    this.actionDescription = (config?.actionDescription as string) || '';
    this.provider = (config?.llmDescriptor?.provider as string) || null;
    this.model = (config?.llmDescriptor?.model as string) || null;
    this.authorization = (config?.llmDescriptor?.authorization as string) || null;
    this.refreshValidationState();
    void this.loadSchemaRequirements();
  }

  ngAfterViewInit() {
    this.rendered();
  }

  async openSimpleParamEditor(key: 'provider' | 'model' | 'authorization' | 'name', event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (key === 'authorization' && !this.isConditionallyRequired('llmDescriptor.authorization')) {
      return;
    }
    this.localEditorKey = key;
    this.localEditorLabel =
      key === 'provider' ? 'Provider' :
      key === 'model' ? 'Model' :
      key === 'authorization' ? 'Authorization' : 'Name';
    this.localEditorValue =
      key === 'provider' ? (this.provider ?? '') :
      key === 'model' ? (this.model ?? '') :
      key === 'authorization' ? (this.authorization ?? '') :
      (this.name ?? '');
    this.localEditorOptions = [];
    this.localEditorLoading = key === 'provider' || key === 'model';
    this.localEditorOpen = true;
    if (key === 'provider' || key === 'model') {
      await this.loadSimpleEditorOptions();
    }
  }

  closeSimpleParamEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.localEditorOpen = false;
    this.localEditorKey = null;
    this.localEditorOptions = [];
    this.localEditorLoading = false;
  }

  saveSimpleParamEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.localEditorKey) return;

    const config = this.ensureBlockConfiguration();
    const value = this.localEditorValue.trim();

    if (this.localEditorKey === 'provider') {
      const descriptor = (config['llmDescriptor'] ??= {});
      descriptor['provider'] = value;
      this.provider = value || null;
      this.model = null;
      this.authorization = null;
      descriptor['model'] = '';
      descriptor['authorization'] = '';
    }
    if (this.localEditorKey === 'model') {
      const descriptor = (config['llmDescriptor'] ??= {});
      descriptor['model'] = value;
      this.model = value || null;
    }
    if (this.localEditorKey === 'authorization') {
      const descriptor = (config['llmDescriptor'] ??= {});
      descriptor['authorization'] = value;
      this.authorization = value || null;
    }
    if (this.localEditorKey === 'name') {
      const nameValue = value.slice(0, 20);
      config['name'] = nameValue;
      this.name = nameValue || this.name;
    }

    this.refreshValidationState();
    this.markFlowDirty();
    this.localEditorOpen = false;
    this.localEditorKey = null;
    this.localEditorOptions = [];
    this.localEditorLoading = false;
  }

  async openActionEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const result = await this.settingsDialog.open({
      title: `Action for "${this.name}"`,
      fields: [
        {
          key: 'actionDescription',
          label: 'Action description',
          type: 'textarea',
          rows: 8,
          placeholder: 'Describe the human task...'
        }
      ],
      initial: { actionDescription: this.actionDescription ?? '' }
    });
    if (!result) return;

    const config = this.ensureBlockConfiguration();
    config['actionDescription'] = String(result['actionDescription'] ?? '');
    this.actionDescription = config['actionDescription'] || '';
    this.refreshValidationState();
    this.markFlowDirty();
  }

  openNameEditor(event?: Event) {
    this.openSimpleParamEditor('name', event);
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

  private async loadSimpleEditorOptions() {
    const key = this.localEditorKey;
    const blockType = this.blockType;
    if (!key || !blockType) {
      this.localEditorLoading = false;
      return;
    }

    const retrieverKey = key === 'provider' ? 'providers' : 'models';
    const context = key === 'model' && this.provider
      ? { provider: this.provider }
      : undefined;

    try {
      const options = await firstValueFrom(
        this.fieldRetreiver.retrieveValues(blockType, retrieverKey, context)
      );
      this.localEditorOptions = options ?? [];
    } catch {
      this.localEditorOptions = [];
    } finally {
      this.localEditorLoading = false;
    }
  }

  private get blockType(): string | null {
    const typeName = this.data?.data?.typeName;
    return typeof typeName === 'string' && typeName.length > 0 ? typeName : null;
  }

  private refreshValidationState() {
    const config = this.data?.data?.specificConfiguration ?? {};
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

  private async loadSchemaRequirements() {
    const type = this.blockType;
    if (!type) return;

    const blockType = await this.blocksService.getBlockType(type);
    const schema = (blockType?.schema ?? null) as Record<string, unknown> | null;
    this.schemaRequirements = extractSchemaRequirements(schema);
    await this.refreshConditionalRequirements();
    this.refreshValidationState();
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
    const context: Record<string, string> = {};
    for (const dep of field.dependsOn) {
      const value = this.getByPath(this.data?.data?.specificConfiguration ?? {}, dep.path);
      context[dep.key] = typeof value === 'string' ? value : '';
    }

    try {
      return await firstValueFrom(
        this.fieldRetreiver.isFieldRequired(blockType, field.retrieverKey, context)
      );
    } catch {
      return false;
    }
  }

  isConditionallyRequired(path: string) {
    return !!this.conditionalRequiredByPath.get(path);
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
