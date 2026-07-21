import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { JsonViewerComponent } from '../json-viewer/json-viewer';

@Component({
  selector: 'app-bias-output-diff',
  standalone: true,
  imports: [CommonModule, JsonViewerComponent],
  templateUrl: './bias-output-diff.html',
  styleUrl: './bias-output-diff.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BiasOutputDiffComponent {
  @Input() baselineOutput: unknown;
  @Input() biasedOutputs: unknown[] = [];
  @Input() baselineLabel = 'Baseline';
  @Input() variantLabel = 'Biased output';

  isText(value: unknown): value is string {
    return typeof value === 'string';
  }
}
