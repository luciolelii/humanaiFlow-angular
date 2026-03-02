import { CommonModule } from '@angular/common';
import { Component, HostBinding, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { EditorStateHolder } from '@stores/flow-editor';
import { FieldRetreiver } from '@services/retreiver/field-retreiver';
import { firstValueFrom } from 'rxjs';

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
  localEditorOpen = false;
  localEditorKey: 'provider' | 'model' | 'name' | null = null;
  localEditorLabel = '';
  localEditorValue = '';
  localEditorOptions: string[] = [];
  localEditorLoading = false;
  missingRequiredParams: string[] = [];

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
    this.refreshValidationState();
  }

  ngAfterViewInit() {
    this.rendered();
  }

  async openSimpleParamEditor(key: 'provider' | 'model' | 'name', event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.localEditorKey = key;
    this.localEditorLabel =
      key === 'provider' ? 'Provider' :
      key === 'model' ? 'Model' : 'Name';
    this.localEditorValue =
      key === 'provider' ? (this.provider ?? '') :
      key === 'model' ? (this.model ?? '') :
      (this.name ?? '');
    this.localEditorOptions = [];
    this.localEditorLoading = key !== 'name';
    this.localEditorOpen = true;
    if (key !== 'name') {
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
    const descriptor = (config['llmDescriptor'] ??= {});
    const value = this.localEditorValue.trim();
    descriptor[this.localEditorKey] = value;

    if (this.localEditorKey === 'provider') {
      this.provider = value || null;
      this.model = null;
      descriptor['model'] = '';
    }
    if (this.localEditorKey === 'model') {
      this.model = value || null;
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
    const requiredFields: Array<{ path: string; label: string }> = [
      { path: 'actionDescription', label: 'Action description' },
      { path: 'llmDescriptor.provider', label: 'Provider' },
      { path: 'llmDescriptor.model', label: 'Model' }
    ];

    this.missingRequiredParams = requiredFields
      .filter((field) => this.isMissingValue(this.getByPath(config, field.path)))
      .map((field) => field.label);
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
}
