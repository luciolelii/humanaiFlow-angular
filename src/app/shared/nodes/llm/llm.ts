import { CommonModule } from '@angular/common';
import { Component, HostBinding, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';

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
  name: string = 'noName';
  localEditorOpen = false;
  localEditorKey: 'provider' | 'model' | null = null;
  localEditorLabel = '';
  localEditorValue = '';

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

    Object.entries(config)
      .filter(([key]) => !['prompt', 'llmDescriptor'].includes(key))
      .forEach(([key, value]) => {
        if (value == null || typeof value === 'object') return;
        this.parameterEntries.push({ key, value: String(value) });
      });
  }

  ngAfterViewInit() {
    this.rendered();
  }

  openSimpleParamEditor(key: 'provider' | 'model', event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.localEditorKey = key;
    this.localEditorLabel = key === 'provider' ? 'Provider' : 'Model';
    this.localEditorValue = key === 'provider' ? (this.provider ?? '') : (this.model ?? '');
    this.localEditorOpen = true;
  }

  closeSimpleParamEditor(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.localEditorOpen = false;
    this.localEditorKey = null;
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
    }
    if (this.localEditorKey === 'model') {
      this.model = value || null;
    }

    this.localEditorOpen = false;
    this.localEditorKey = null;
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
