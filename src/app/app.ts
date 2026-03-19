import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogHostComponent } from '@shared/confirm-dialog/confirm-dialog';
import { HumanInteractionDialogHostComponent } from '@shared/human-interaction-dialog/human-interaction-dialog';
import { NodeSettingsDialogHostComponent } from '@shared/node-settings-dialog/node-settings-dialog';
import { SubflowPreviewDialogHostComponent } from '@shared/subflow-preview-dialog/subflow-preview-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialogHostComponent, HumanInteractionDialogHostComponent, NodeSettingsDialogHostComponent, SubflowPreviewDialogHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('HumAInFlow');
}
