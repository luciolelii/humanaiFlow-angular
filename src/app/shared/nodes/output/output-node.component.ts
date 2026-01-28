import {
  Component,
  Input,
  HostBinding,
} from "@angular/core";
import { ClassicPreset } from "rete";
import { CommonModule } from "@angular/common";
import { ReteModule } from "rete-angular-plugin/21";

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

    console.log("OutputNodeComponent ngOnInit", key, input);

    this.inputKey = key;
    this.inputSocket = (input as any).socket;

  }
}
