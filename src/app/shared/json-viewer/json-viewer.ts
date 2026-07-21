import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Lightweight, dependency-free JSON tree for diagnostic and report views. */
@Component({
  selector: 'app-json-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-viewer.html',
  styleUrl: './json-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JsonViewerComponent {
  @Input() value: unknown;
  @Input() label: string | null = null;
  @Input() initiallyExpanded = true;

  private readonly collapsedPaths = new Set<string>();

  isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  isExpandable(value: unknown): boolean {
    return this.isArray(value) || this.isObject(value);
  }

  entries(value: Record<string, unknown>): Array<{ key: string; value: unknown }> {
    return Object.entries(value).map(([key, entryValue]) => ({ key, value: entryValue }));
  }

  summary(value: unknown): string {
    if (this.isArray(value)) return `Array (${value.length})`;
    if (this.isObject(value)) return `Object (${Object.keys(value).length})`;
    return this.formatPrimitive(value);
  }

  formatPrimitive(value: unknown): string {
    if (typeof value === 'string') return `"${value}"`;
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  isExpanded(path: string): boolean {
    return this.initiallyExpanded && !this.collapsedPaths.has(path);
  }

  onToggle(path: string, event: Event) {
    const expanded = (event.target as HTMLDetailsElement).open;
    if (expanded) this.collapsedPaths.delete(path);
    else this.collapsedPaths.add(path);
  }
}
