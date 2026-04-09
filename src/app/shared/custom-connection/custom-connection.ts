import { ChangeDetectionStrategy, Component, inject, Input } from '@angular/core';
import { ClassicPreset } from 'rete';
import { FLOW_DEPENDANT_PORT_KEY, FLOW_DEPENDENCY_PORT_KEY } from '@models/flow';
import { GraphSelectionService } from '@services/graph-selection/graph-selection';

@Component({
  selector: 'app-custom-connection',
  standalone: true,
  template: `
    <svg data-testid="connection" [attr.data-connection-id]="connectionId">
      <path
        [attr.d]="path"
        [attr.stroke]="strokeColor"
        [attr.stroke-width]="strokeWidth"
        [attr.stroke-dasharray]="strokeDasharray"
        [attr.opacity]="opacity"
        (pointerdown)="selectConnection($event)"
        (click)="selectConnection($event)">
      </path>
      @if (isSelected) {
      <foreignObject
        class="connection-delete-wrap"
        [attr.x]="deleteButtonX"
        [attr.y]="deleteButtonY"
        width="28"
        height="28">
        <button
          xmlns="http://www.w3.org/1999/xhtml"
          type="button"
          class="connection-delete"
          title="Delete connection"
          (pointerdown)="deleteConnection($event)"
          (click)="deleteConnection($event)">
          <span>×</span>
        </button>
      </foreignObject>
      }
    </svg>
  `,
  styles: [`
    :host svg {
      overflow: visible !important;
      position: absolute;
      pointer-events: none;
      width: 9999px;
      height: 9999px;
    }

    :host path {
      fill: none;
      pointer-events: auto;
      cursor: pointer;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    :host .connection-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 999px;
      background: #fff;
      color: #dc2626;
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.18);
      cursor: pointer;
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
      padding: 0;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
    }

    :host .connection-delete-wrap {
      overflow: visible;
      pointer-events: auto;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomConnectionComponent {
  private readonly graphSelection = inject(GraphSelectionService);
  @Input() data!: ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>;
  @Input() start!: { x: number; y: number };
  @Input() end!: { x: number; y: number };
  @Input() path = '';

  get isDependencyConnection(): boolean {
    return this.data?.sourceOutput === FLOW_DEPENDANT_PORT_KEY && this.data?.targetInput === FLOW_DEPENDENCY_PORT_KEY;
  }

  get connectionId(): string {
    return String(this.data?.id ?? '');
  }

  get isSelected(): boolean {
    return this.graphSelection.selectedConnectionId() === this.connectionId;
  }

  get strokeColor(): string {
    if (this.isSelected) return '#f97316';
    return this.isDependencyConnection ? '#7c8ba1' : '#4682b4';
  }

  get strokeWidth(): number {
    if (this.isSelected) return this.isDependencyConnection ? 3.25 : 6;
    return this.isDependencyConnection ? 2.25 : 5;
  }

  get strokeDasharray(): string | null {
    return this.isDependencyConnection ? '6 6' : null;
  }

  get opacity(): number {
    return this.isDependencyConnection ? 0.95 : 1;
  }

  get deleteButtonX(): number {
    return ((this.start?.x ?? 0) + (this.end?.x ?? 0)) / 2 - 12;
  }

  get deleteButtonY(): number {
    return ((this.start?.y ?? 0) + (this.end?.y ?? 0)) / 2 - 12;
  }

  selectConnection(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.graphSelection.selectConnection(this.connectionId);
  }

  deleteConnection(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.graphSelection.selectConnection(this.connectionId);
    this.graphSelection.requestDeleteSelectedConnection();
  }
}
