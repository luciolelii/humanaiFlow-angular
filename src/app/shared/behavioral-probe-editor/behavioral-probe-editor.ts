import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, Output, EventEmitter, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BiasCapabilities } from '@models/bias-impact';
import { BehavioralProbe, BiasActivationMode, FlowBlock, FlowContainer, FlowNode, FlowPort } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { Observable, take } from 'rxjs';

@Component({
  selector: 'app-behavioral-probe-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './behavioral-probe-editor.html',
  styleUrl: './behavioral-probe-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BehavioralProbeEditorComponent implements OnChanges {
  private readonly blocks = inject(BlocksService);
  private readonly containers = inject(ContainersService);
  private capabilityRequestVersion = 0;
  private capabilityKey: string | null = null;

  @Input() block: FlowNode | null = null;
  @Input() probe: BehavioralProbe | undefined;
  @Input() readonly = false;
  @Output() probeChange = new EventEmitter<BehavioralProbe | undefined>();

  capabilities: BiasCapabilities | null = null;
  loadingCapabilities = false;
  capabilityError: string | null = null;
  mockValueErrors: Record<string, string> = {};

  get blockType(): string | null {
    const value = this.block?.typeName;
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  get activationModes(): BiasActivationMode[] {
    return this.capabilities?.activationModes ?? [];
  }

  get supported(): boolean {
    return this.capabilities?.supported !== false;
  }

  get currentProbe(): BehavioralProbe {
    return this.probe ?? {};
  }

  get isMockResponse(): boolean {
    return this.currentProbe.activationMode === 'MOCK_RESPONSE';
  }

  get selectedTargetInputs(): string[] {
    return this.currentProbe.targetInputs ?? [];
  }

  ngOnChanges() {
    void this.loadCapabilities();
  }

  selectActivationMode(mode: string) {
    const activationMode = mode as BiasActivationMode;
    if (!activationMode) {
      this.emit({ ...this.currentProbe, activationMode: undefined });
      return;
    }

    if (activationMode === 'MOCK_RESPONSE') {
      this.mockValueErrors = {};
      this.emit({
        ...this.currentProbe,
        activationMode,
        instruction: undefined,
        targetInputs: [],
        mockOutputs: this.normalizedMockOutputs(this.currentProbe.mockOutputs)
      });
      return;
    }

    this.emit({
      ...this.currentProbe,
      activationMode,
      mockOutputs: undefined
    });
  }

  setInstruction(instruction: string) {
    this.emit({ ...this.currentProbe, instruction });
  }

  setExpectedImpact(expectedImpact: string) {
    this.emit({ ...this.currentProbe, expectedImpact });
  }

  toggleTargetInput(name: string, checked: boolean) {
    const selected = new Set(this.selectedTargetInputs);
    if (checked) selected.add(name);
    else selected.delete(name);
    this.emit({ ...this.currentProbe, targetInputs: [...selected] });
  }

  setRoutingOutput(name: string) {
    this.emit({ ...this.currentProbe, instruction: name });
  }

  setTextMockOutput(port: FlowPort, value: string) {
    this.setMockOutput(port.name, value);
  }

  setBooleanMockOutput(port: FlowPort, checked: boolean) {
    this.setMockOutput(port.name, checked);
  }

  setJsonMockOutput(port: FlowPort, value: string) {
    try {
      const parsed = JSON.parse(value);
      if (port.multiple && !Array.isArray(parsed)) {
        throw new Error('Use a JSON array for a multiple output.');
      }
      this.mockValueErrors = { ...this.mockValueErrors, [port.name]: '' };
      this.setMockOutput(port.name, parsed);
    } catch (error) {
      this.mockValueErrors = {
        ...this.mockValueErrors,
        [port.name]: error instanceof Error ? error.message : 'Invalid JSON value.'
      };
    }
  }

  mockValueText(port: FlowPort): string {
    const value = this.currentProbe.mockOutputs?.[port.name];
    if (typeof value === 'string') return value;
    if (value === undefined) return '';
    return JSON.stringify(value, null, 2);
  }

  mockBooleanValue(port: FlowPort): boolean {
    return this.currentProbe.mockOutputs?.[port.name] === true;
  }

  private async loadCapabilities() {
    const blockType = this.blockType;
    if (!blockType) {
      this.capabilities = null;
      this.capabilityKey = null;
      return;
    }

    const nextCapabilityKey = `${blockType}:${this.configurationFingerprint()}`;
    if (nextCapabilityKey === this.capabilityKey && (this.capabilities || this.loadingCapabilities)) return;
    this.capabilityKey = nextCapabilityKey;

    const requestVersion = ++this.capabilityRequestVersion;
    this.loadingCapabilities = true;
    this.capabilityError = null;
    this.retrieveCapabilities(blockType).pipe(take(1)).subscribe({
      next: (capabilities) => {
        if (requestVersion !== this.capabilityRequestVersion) return;
        if (!capabilities.configurationDependent || !this.block) {
          this.capabilities = capabilities;
          this.loadingCapabilities = false;
          return;
        }
        this.retrieveCapabilitiesForInstance(blockType).pipe(take(1)).subscribe({
          next: (instanceCapabilities) => {
            if (requestVersion !== this.capabilityRequestVersion) return;
            this.capabilities = instanceCapabilities;
            this.loadingCapabilities = false;
          },
          error: () => {
            if (requestVersion !== this.capabilityRequestVersion) return;
            this.capabilityError = 'Unable to load the configured block capabilities.';
            this.loadingCapabilities = false;
          }
        });
      },
      error: () => {
        if (requestVersion !== this.capabilityRequestVersion) return;
        this.capabilityError = 'Unable to load bias capabilities.';
        this.loadingCapabilities = false;
      }
    });
  }

  private retrieveCapabilities(nodeType: string): Observable<BiasCapabilities> {
    return this.block?.nodeFamily === 'container'
      ? this.containers.retrieveBiasCapabilities(nodeType)
      : this.blocks.retrieveBiasCapabilities(nodeType);
  }

  private retrieveCapabilitiesForInstance(nodeType: string): Observable<BiasCapabilities> {
    return this.block?.nodeFamily === 'container'
      ? this.containers.retrieveBiasCapabilitiesForInstance(nodeType, this.block as FlowContainer)
      : this.blocks.retrieveBiasCapabilitiesForInstance(nodeType, this.block as FlowBlock);
  }

  private setMockOutput(name: string, value: unknown) {
    this.emit({
      ...this.currentProbe,
      mockOutputs: { ...this.normalizedMockOutputs(this.currentProbe.mockOutputs), [name]: value }
    });
  }

  private normalizedMockOutputs(existing: Record<string, unknown> | undefined): Record<string, unknown> {
    return (this.block?.outputs ?? []).reduce<Record<string, unknown>>((result, port) => {
      result[port.name] = existing?.[port.name] ?? this.defaultMockValue(port);
      return result;
    }, {});
  }

  private defaultMockValue(port: FlowPort): unknown {
    if (port.multiple) return [];
    if (port.type === 'BOOLEAN') return false;
    if (port.type === 'JSON') return {};
    return '';
  }

  private configurationFingerprint(): string {
    try {
      return JSON.stringify(this.block?.specificConfiguration ?? {});
    } catch {
      return String(this.block?.specificConfiguration ?? '');
    }
  }

  private emit(probe: BehavioralProbe) {
    this.probeChange.emit(probe);
  }
}
