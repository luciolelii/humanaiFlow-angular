import { Component, computed, inject, model, signal, Signal, WritableSignal } from '@angular/core';
import { BlockType } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { ListStateViewHolder, OrderViewState } from '@utilities/list-state-holder';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BLOCK_TYPE_DRAG_MIME } from './block-drag';

@Component({
  selector: 'app-blocks-list',
  imports: [FormsModule, MatCardModule, MatChipsModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './blocks-list.html',
  styleUrl: './blocks-list.css',
})
export class BlocksList extends ListStateViewHolder<BlockType> {

  searchTerm = model<string>('');

  private blocksService = inject(BlocksService);

  loading: WritableSignal<boolean> = signal(true);

  /*
  get orderView() {
    const existingState = this.view;
    return existingState.order;
  }*/

  blockTypes?: Signal<BlockType[]>;

  constructor() {
    super('blocksList', {
      defaultOrder: { orderBy: 'name', orderDir: 'asc' } as OrderViewState
    });
  }

  ngOnInit() {
    const existingState = this.view;
    if (existingState.list) {
      this.blockTypes = existingState.list;
      this.loading.set(false);
      return;
    }

    this.blocksService.getAllBlocksTypes().then((blockTypesSignal) => {
      this.blockTypes = blockTypesSignal;
      this.view.list = this.blockTypes;
    }).catch((err) => {
      console.error('Error loading block types', err);
    }).finally(() => {
      this.loading.set(false);
    });
  }

  filteredBlocks = computed(() => {
    const blocks = this.blockTypes ? this.blockTypes() : [];
    if (!blocks) return [];

    const term = this.searchTerm().toLowerCase();
    return blocks.filter((b) =>
      b.type.toLowerCase().includes(term) || b.description.toLowerCase().includes(term)
    );
  });

  onDragStart(event: DragEvent, block: BlockType) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(BLOCK_TYPE_DRAG_MIME, JSON.stringify(block));
    event.dataTransfer.setData('text/plain', block.type);
  }
}
