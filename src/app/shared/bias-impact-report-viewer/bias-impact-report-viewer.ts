import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BiasDownstreamImpactEntry, BiasImpactReport } from '@models/bias-impact';
import { BiasOutputDiffComponent } from '../bias-output-diff/bias-output-diff';

@Component({
  selector: 'app-bias-impact-report-viewer',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, BiasOutputDiffComponent],
  templateUrl: './bias-impact-report-viewer.html',
  styleUrl: './bias-impact-report-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BiasImpactReportViewerComponent {
  @Input() report: BiasImpactReport | null = null;

  changedOnly = false;

  get downstreamEntries(): BiasDownstreamImpactEntry[] {
    const entries = this.report?.downstreamImpact ?? [];
    return this.changedOnly ? entries.filter((entry) => entry.changed) : entries;
  }

  percent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  textDifference(value: number): string {
    return `${value.toFixed(3)} (0 = identical, 1 = maximally different)`;
  }
}
