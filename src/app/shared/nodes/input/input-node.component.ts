import {
  Component,
  Input,
  HostBinding,
  ChangeDetectorRef,
  OnChanges
} from "@angular/core";
import { ClassicPreset } from "rete";
import { CommonModule, KeyValue } from "@angular/common";
import { ReteModule } from "rete-angular-plugin/21";

@Component({
  templateUrl: "./input-node.component.html",
  styleUrls: ["./input-node.component.scss"],
  imports: [CommonModule, ReteModule],
  host: {
    "data-testid": "input-node"
  }
})
export class InputNodeComponent implements OnChanges {
  @Input() data!: ClassicPreset.Node;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  seed = 0;

  @HostBinding("class.selected") get selected() {
    return this.data.selected;
  }

  constructor(private cdr: ChangeDetectorRef) {
    this.cdr.detach();
  }

  ngOnChanges(): void {
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rendered());
    this.seed++; // force render sockets
  }

  sortByIndex(
  a: KeyValue<string, { index?: number } | undefined>,
  b: KeyValue<string, { index?: number } | undefined>
): number {
  return (a.value?.index ?? 0) - (b.value?.index ?? 0);
}
}
