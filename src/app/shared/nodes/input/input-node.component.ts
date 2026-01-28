import {
  Component,
  Input,
  HostBinding,
} from "@angular/core";
import { CommonModule, KeyValue } from "@angular/common";
import { ReteModule } from "rete-angular-plugin/21";
import { ClassicPreset } from "rete";

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


  @HostBinding("class.selected") get selected() {
    return this.data.selected;
  }

  outputKey!: string;
  outputSocket!: ClassicPreset.Socket;

  ngOnInit() {
    const entries = Object.entries(this.data.outputs);
    const [key, output] = entries[0];

    console.log("InputNodeComponent ngOnInit", key, output);

    this.outputKey = key;
    this.outputSocket = (output as any).socket;
  }

  ngAfterViewInit() {
    this.rendered();
  }

}
