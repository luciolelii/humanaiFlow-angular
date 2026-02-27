import {  ChangeDetectorRef, Component, ElementRef, HostBinding, Input } from "@angular/core";
import { ReteModule } from "rete-angular-plugin/21";

@Component({
  standalone: true,
  imports: [ReteModule],
  host: {
    refComponent: '',
    class: `
       cursor-crosshair relative -left-3 w-1 h-6 flex items-center justify-center rounded-full bg-green-500 shadow-[0_0_0_1px_rgb(34,197,94)] z-50
      `
  },
  template: ``
})
export class InputSocket {
  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  @HostBinding("title") get title() {
    return this.data?.name ?? "";
  }

  ngOnInit(): void {
    console.log("InputSocket ngOnInit", this.data);
  }

 
 ngAfterViewInit() {
  requestAnimationFrame(() => {
    this.rendered?.();
  });
}

  constructor(private cdr: ChangeDetectorRef) {
    this.cdr.detach();
  }

  ngOnChanges(): void {
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rendered());
  }

}