import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { pathToLabel } from '@shared/nodes/node-utility';
import { resolveTemplateSegments, TemplatePlaceholderSegment } from './template-placeholder';

const TRUNCATE_LENGTH = 200;

/**
 * Renders question/actionDescription text with its `${{...}}` placeholders resolved
 * to actual values, without concatenating long/array values inline: each resolved
 * value becomes its own expandable card (single value) or collapsed-by-default
 * accordion (array value), never a giant text blob.
 * See docs/human-block-placeholder-resolution-frontend-integration-2026-07-24.md.
 */
@Component({
  selector: 'app-template-placeholder-text',
  imports: [CommonModule],
  templateUrl: './template-placeholder-text.html',
  styleUrl: './template-placeholder-text.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplatePlaceholderTextComponent {
  readonly text = input<string | null | undefined>('');
  readonly values = input<Record<string, unknown>>({});

  private readonly expandedSingleValues = signal<Set<number>>(new Set());
  private readonly expandedItems = signal<Set<string>>(new Set());
  private readonly fullyExpandedItems = signal<Set<string>>(new Set());

  readonly segments = computed<TemplatePlaceholderSegment[]>(() =>
    resolveTemplateSegments(this.text(), this.values())
  );

  segmentLabel(name: string): string {
    const lastPart = name.includes('.') ? name.split('.').pop() ?? name : name;
    return pathToLabel(lastPart);
  }

  hasValue(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  stringifyValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  itemsFor(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  isLong(text: string): boolean {
    return text.length > TRUNCATE_LENGTH;
  }

  truncate(text: string): string {
    return this.isLong(text) ? `${text.slice(0, TRUNCATE_LENGTH)}…` : text;
  }

  isSingleExpanded(segIndex: number): boolean {
    return this.expandedSingleValues().has(segIndex);
  }

  toggleSingle(segIndex: number) {
    this.expandedSingleValues.update((current) => {
      const next = new Set(current);
      if (next.has(segIndex)) {
        next.delete(segIndex);
      } else {
        next.add(segIndex);
      }
      return next;
    });
  }

  isItemExpanded(segIndex: number, itemIndex: number): boolean {
    return this.expandedItems().has(this.itemKey(segIndex, itemIndex));
  }

  toggleItem(segIndex: number, itemIndex: number) {
    const key = this.itemKey(segIndex, itemIndex);
    this.expandedItems.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  isItemFullyExpanded(segIndex: number, itemIndex: number): boolean {
    return this.fullyExpandedItems().has(this.itemKey(segIndex, itemIndex));
  }

  toggleItemFull(segIndex: number, itemIndex: number, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const key = this.itemKey(segIndex, itemIndex);
    this.fullyExpandedItems.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  allItemsExpanded(segIndex: number, itemCount: number): boolean {
    if (!itemCount) return false;
    const expanded = this.expandedItems();
    for (let i = 0; i < itemCount; i++) {
      if (!expanded.has(this.itemKey(segIndex, i))) return false;
    }
    return true;
  }

  toggleAllItems(segIndex: number, itemCount: number, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const shouldExpand = !this.allItemsExpanded(segIndex, itemCount);
    this.expandedItems.update((current) => {
      const next = new Set(current);
      for (let i = 0; i < itemCount; i++) {
        const key = this.itemKey(segIndex, i);
        if (shouldExpand) {
          next.add(key);
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  }

  private itemKey(segIndex: number, itemIndex: number): string {
    return `${segIndex}:${itemIndex}`;
  }
}
