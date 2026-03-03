import { CommonModule } from '@angular/common';
import { Component, HostBinding, inject, Input } from '@angular/core';
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
  selector: 'app-llm',
  imports: [CommonModule, FormsModule, ReteModule],
  templateUrl: './llm.html',
  styleUrl: './llm.css',
  host: {
    "data-testid": "node"
  }
})
export class LLMNodeComponent {

  private settingsDialog = inject(NodeSettingsDialogService);
  private editorState = inject(EditorStateHolder);
  private fieldRetreiver = inject(FieldRetreiver);
  private blocksService = inject(BlocksService);

  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;


  @HostBinding("class.selected") get selected() {
    return this.data.selected;
  }


  outputs : { key:string, socket: ClassicPreset.Socket }[] = [];

  inputs: { key:string, socket: ClassicPreset.Socket } [] = [];
  parameterEntries: { key: string; value: string }[] = [];

  prompt: string | null = null;
  promptParts: { text: string; isDynamicInput: boolean }[] = [];
  provider: string | null = null;
  model: string | null = null;
  authorization: string | null = null;
  name: string = 'noName';
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
    this.parameterEntries = [];
    this.prompt = null;
    this.promptParts = [];
    this.provider = null;
    this.model = null;

    const outputEntries = Object.entries(this.data.outputs);
    
    outputEntries.forEach(([key, output]) => {
      this.outputs.push({ key, socket: (output as any).socket });
    });

    const inputEntries = Object.entries(this.data.inputs);
    
    inputEntries.forEach(([inKey, input]) => {
      this.inputs.push({ key: inKey, socket: (input as any).socket });
    });

    const config = this.blockConfiguration;
    if (!config) return;

    this.name = this.toStringOrNull(config['name']) || this.name; 

    this.prompt = this.toStringOrNull(config['prompt']);
    this.promptParts = this.splitPromptParts(this.prompt);
    this.provider = this.toStringOrNull(config['llmDescriptor']?.['provider']);
    this.model = this.toStringOrNull(config['llmDescriptor']?.['model']);
    this.authorization = this.toStringOrNull(config['llmDescriptor']?.['authorization']);

    Object.entries(config)
      .filter(([key]) => !['prompt', 'llmDescriptor'].includes(key))
      .forEach(([key, value]) => {
        if (value == null || typeof value === 'object') return;
        this.parameterEntries.push({ key, value: String(value) });
      });

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

  async openPromptEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const result = await this.settingsDialog.open({
      title: `Prompt for "${this.name}"`,
      fields: [
        {
          key: 'prompt',
          label: 'Prompt',
          type: 'textarea',
          rows: 12,
          placeholder: 'Write prompt...',
          tip: 'You can use ${{inputName}} to add dynamic inputs.'
        }
      ],
      initial: { prompt: this.prompt ?? '' }
    });
    if (!result) return;

    const config = this.ensureBlockConfiguration();
    config['prompt'] = String(result['prompt'] ?? '');
    this.prompt = config['prompt'] || null;
    this.promptParts = this.splitPromptParts(this.prompt);
    this.refreshValidationState();
    this.markFlowDirty();
  }

  openNameEditor(event?: Event) {
    this.openSimpleParamEditor('name', event);
  }

  private get blockConfiguration(): Record<string, any> | null {
    return this.data?.data?.specificConfiguration ?? null;
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

  private toStringOrNull(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    return null;
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
      const value = this.getByPath(this.blockConfiguration ?? {}, dep.path);
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

  private splitPromptParts(prompt: string | null): { text: string; isDynamicInput: boolean }[] {
    if (!prompt) return [];

    const parts: { text: string; isDynamicInput: boolean }[] = [];
    const re = /\$\{\{[^}]+\}\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(prompt)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          text: prompt.slice(lastIndex, match.index),
          isDynamicInput: false
        });
      }

      parts.push({
        text: match[0],
        isDynamicInput: true
      });
      lastIndex = re.lastIndex;
    }

    if (lastIndex < prompt.length) {
      parts.push({
        text: prompt.slice(lastIndex),
        isDynamicInput: false
      });
    }

    return parts;
  }

  formatDynamicInputToken(token: string): string {
    const match = token.match(/^\$\{\{\s*([^}]+?)\s*\}\}$/);
    return match ? match[1] : token;
  }

}
