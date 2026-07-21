import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogHostComponent } from '@shared/confirm-dialog/confirm-dialog';
import { GlobalNotificationComponent } from '@shared/global-notification/global-notification';
import { HumanInteractionDialogHostComponent } from '@shared/human-interaction-dialog/human-interaction-dialog';
import { NodeSettingsDialogHostComponent } from '@shared/node-settings-dialog/node-settings-dialog';
import { SubflowPreviewDialogHostComponent } from '@shared/subflow-preview-dialog/subflow-preview-dialog';
import { BiasImpactExperimentDialogHostComponent } from '@shared/bias-impact-experiment-dialog/bias-impact-experiment-dialog';
import { BiasRerunDialogHostComponent } from '@shared/bias-rerun-dialog/bias-rerun-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialogHostComponent, GlobalNotificationComponent, HumanInteractionDialogHostComponent, NodeSettingsDialogHostComponent, SubflowPreviewDialogHostComponent, BiasImpactExperimentDialogHostComponent, BiasRerunDialogHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  protected readonly title = signal('HumAInFlow');
}
