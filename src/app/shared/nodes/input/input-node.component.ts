import {
  Component,
  Input,
  HostBinding,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule, KeyValue } from "@angular/common";
import { ReteModule } from "rete-angular-plugin/21";
import { HFNode } from "@models/nodes";

@Component({
  templateUrl: "./input-node.component.html",
  styleUrls: ["./input-node.component.scss"],
  imports: [CommonModule, ReteModule],
  host: {
    "data-testid": "node"
  }
})
export class InputNodeComponent {
  @Input() data!: any;
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
