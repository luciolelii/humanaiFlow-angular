import { CommonModule } from '@angular/common';
import { Component, HostBinding, Input } from '@angular/core';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';

@Component({
  selector: 'app-llm',
  imports: [CommonModule, ReteModule],
  templateUrl: './llm.html',
  styleUrl: './llm.css',
  host: {
    "data-testid": "node"
  }
})
export class LLMNodeComponent {

  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;


  @HostBinding("class.selected") get selected() {
    return this.data.selected;
  }

  outputKey!: string;
  outputSocket!: ClassicPreset.Socket;

  inputKey!: string;
  inputSocket!: ClassicPreset.Socket;

  ngOnInit() {
    const outputEntries = Object.entries(this.data.outputs);
    const [outKey, output] = outputEntries[0];

    this.outputKey = outKey;
    this.outputSocket = (output as any).socket;
    console.log("output data", this.outputSocket);

    const inputEntries = Object.entries(this.data.inputs);
    const [inKey, input] = inputEntries[0];

    this.inputKey = inKey;
    this.inputSocket = (input as any).socket;
    console.log("input data", this.inputSocket);
  }

  ngAfterViewInit() {
    this.rendered();
  }

  

}
