import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

/**
 * Shared centered-modal chrome (backdrop, panel, header with title/subtitle/close,
 * content wrapper) used by the small action dialogs whose layout only differs in
 * body/footer content. `footer` is optional — project a top-level `<footer>` element
 * to get one, matching each dialog's own styling for its buttons.
 */
@Component({
  selector: 'app-modal-shell',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './modal-shell.html',
  styleUrl: './modal-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalShellComponent {
  @Input() title = '';
  @Input() subtitle: string | null = null;
  @Input({ required: true }) ariaLabel!: string;
  @Input() maxWidth = '680px';
  @Input() closeLabel = 'Close';
  @Output() backdropClick = new EventEmitter<void>();
  @Output() closeClick = new EventEmitter<void>();
}
