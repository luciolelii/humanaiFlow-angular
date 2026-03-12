import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';

@Component({
  selector: 'app-confirm-dialog-host',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialogHostComponent {

  private confirm: ConfirmDialogService = inject(ConfirmDialogService);

  state = this.confirm.state;

  close(result: boolean) {
    this.confirm.confirm(result);
  }
}
