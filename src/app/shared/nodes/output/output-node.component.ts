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
import { HFNode } from "@models/nodes";

@Component({
  templateUrl: "./output-node.component.html",
  styleUrls: ["./output-node.component.scss"],
  imports: [CommonModule, ReteModule],
  host: {
    "data-testid": "node"
  }
})
export class OutputNodeComponent {
  @Input() data!: ClassicPreset.Node;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  seed = 0;

  @HostBinding("class.selected") get selected() {
    return this.data.selected;
  }

  inputKey!: string;
  inputSocket!: ClassicPreset.Socket;

  ngAfterViewInit() {
    this.rendered();
  }

  ngOnInit(): void {
    const entries = Object.entries(this.data.inputs);
    const [key, input] = entries[0];

    this.inputKey = key;
    this.inputSocket = (input as any).socket;

  }
}
