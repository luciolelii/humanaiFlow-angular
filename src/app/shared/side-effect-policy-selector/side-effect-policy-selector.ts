import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ExternalSideEffectPolicy } from '@models/bias-impact';

@Component({
  selector: 'app-side-effect-policy-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './side-effect-policy-selector.html',
  styleUrl: './side-effect-policy-selector.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SideEffectPolicySelectorComponent {
  @Input() policy: ExternalSideEffectPolicy = 'BLOCK';
  @Input() externalSideEffects = false;
  @Input() disabled = false;
  @Output() policyChange = new EventEmitter<ExternalSideEffectPolicy>();

  select(policy: ExternalSideEffectPolicy) {
    if (!this.disabled) this.policyChange.emit(policy);
  }
}
