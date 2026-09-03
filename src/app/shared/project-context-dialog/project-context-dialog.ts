import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ProjectContext,
  ProjectContextEntry,
  ProjectContextEntryType,
  projectTemplateReference
} from '@models/project';
import { ProjectContextDialogService } from '@services/dialogs/project-context-dialog';
import { NotificationService } from '@services/notifications/notification';
import { ModalShellComponent } from '@shared/modal-shell/modal-shell';

/** Names starting with these would collide with the runtime's own placeholder namespaces. */
const RESERVED_PREFIXES = ['project.', 'global.', 'context.', 'vars.'];
const VALID_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;

/**
 * Editor for the values a project shares with its flows.
 *
 * Modelled directly on the Global Inputs panel in the title toolbar: users already map that panel
 * onto `${{global.x}}`, and these values work the same way under `${{project.x}}`.
 */
@Component({
  selector: 'app-project-context-dialog',
  imports: [
    FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule,
    MatTooltipModule, ModalShellComponent
  ],
  templateUrl: './project-context-dialog.html',
  styleUrl: './project-context-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectContextDialogComponent {
  private readonly dialog = inject(ProjectContextDialogService);
  private readonly notifications = inject(NotificationService);

  readonly state = this.dialog.state;
  readonly entries = signal<ProjectContextEntry[]>([]);

  readonly entryTypes: ProjectContextEntryType[] = ['TEXT', 'BOOLEAN', 'JSON', 'CSV'];

  /** Same rules, wording and shape as TitleToolbar.globalInputValidationErrors. */
  readonly validationErrors = computed(() => {
    const entries = this.entries();
    const nameCounts = new Map<string, number>();

    for (const entry of entries) {
      const normalized = String(entry.name ?? '').trim().toLowerCase();
      if (!normalized) continue;
      nameCounts.set(normalized, (nameCounts.get(normalized) ?? 0) + 1);
    }

    return entries.map((entry) => {
      const name = String(entry.name ?? '').trim();
      if (!name) return 'Name is required';
      if ((nameCounts.get(name.toLowerCase()) ?? 0) > 1) return 'Name must be unique';
      if (RESERVED_PREFIXES.some((prefix) => name.toLowerCase().startsWith(prefix))) {
        return 'Name must not start with project., global., context. or vars.';
      }
      if (!VALID_NAME.test(name)) return 'Name must be usable as a ${{...}} placeholder';
      return null;
    });
  });

  readonly hasErrors = computed(() => this.validationErrors().some((message) => !!message));

  constructor() {
    effect(() => {
      const project = this.state()?.project;
      this.entries.set(project ? project.sharedContext.entries.map((entry) => ({ ...entry })) : []);
    });
  }

  templateReference(name: string): string {
    return projectTemplateReference(name);
  }

  addEntry() {
    this.entries.update((entries) => [
      ...entries,
      { name: '', type: 'TEXT', multiple: false, value: '', description: null }
    ]);
  }

  removeEntry(index: number) {
    this.entries.update((entries) => entries.filter((_, i) => i !== index));
  }

  updateName(index: number, name: string) {
    this.patch(index, { name });
  }

  updateType(index: number, type: ProjectContextEntryType) {
    this.patch(index, { type });
  }

  updateValue(index: number, value: string) {
    this.patch(index, { value });
  }

  async copyReference(name: string) {
    try {
      await navigator.clipboard.writeText(this.templateReference(name));
      this.notifications.show('Placeholder copied', 'success');
    } catch {
      // Clipboard access can be denied; the reference is visible on screen either way.
    }
  }

  cancel() {
    this.dialog.close(null);
  }

  save() {
    if (this.hasErrors()) return;
    const context: ProjectContext = {
      entries: this.entries().map((entry) => ({ ...entry, name: entry.name.trim() }))
    };
    this.dialog.close(context);
  }

  private patch(index: number, changes: Partial<ProjectContextEntry>) {
    this.entries.update((entries) =>
      entries.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)));
  }
}
