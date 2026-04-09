import { ChangeDetectionStrategy, Component, computed, inject, model, signal, Signal, WritableSignal } from '@angular/core';
import { BlockType } from '@models/flow';
import { ContainersService } from '@services/containers/containers';
import { ListStateViewHolder, OrderViewState } from '@utilities/list-state-holder';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BLOCK_TYPE_DRAG_MIME } from '@shared/blocks-list/block-drag';

@Component({
  selector: 'app-containers-list',
  imports: [FormsModule, MatCardModule, MatChipsModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './containers-list.html',
  styleUrl: './containers-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContainersList extends ListStateViewHolder<BlockType> {
  searchTerm = model<string>('');

  private containersService = inject(ContainersService);

  loading: WritableSignal<boolean> = signal(true);
  readonly serviceLoading = this.containersService.catalogLoading;
  containerTypes?: Signal<BlockType[]>;

  constructor() {
    super('containersList', {
      defaultOrder: { orderBy: 'name', orderDir: 'asc' } as OrderViewState
    });
  }

  ngOnInit() {
    const existingState = this.view;
    if (existingState.list) {
      this.containerTypes = existingState.list;
      this.loading.set(false);
      return;
    }

    if (this.containersService.hasLoadedContainerTypes()) {
      this.containerTypes = this.containersService.containerTypes;
      this.view.list = this.containerTypes;
      this.loading.set(false);
      return;
    }

    this.containersService.getAllContainerTypes().then((containerTypesSignal) => {
      this.containerTypes = containerTypesSignal;
      this.view.list = this.containerTypes;
    }).catch((err) => {
      console.error('Error loading container types', err);
    }).finally(() => {
      this.loading.set(false);
    });
  }

  filteredContainers = computed(() => {
    const containers = this.containerTypes ? this.containerTypes() : [];
    if (!containers) return [];

    const term = this.searchTerm().toLowerCase();
    return containers.filter((container) =>
      container.type.toLowerCase().includes(term) || container.description.toLowerCase().includes(term)
    );
  });

  readonly showLoading = computed(() => this.loading() || this.serviceLoading());

  onDragStart(event: DragEvent, container: BlockType) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(BLOCK_TYPE_DRAG_MIME, JSON.stringify(container));
    event.dataTransfer.setData('text/plain', container.type);
  }
}
