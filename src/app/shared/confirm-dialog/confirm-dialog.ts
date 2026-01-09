import { Component, inject, Input } from '@angular/core';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';

@Component({
  selector: 'app-confirm-dialog-host',
  standalone: true,
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialogHostComponent {

  private confirm: ConfirmDialogService = inject(ConfirmDialogService);

  state = this.confirm.state;

  close(result: boolean) {
    this.confirm.confirm(result);
  }
}
