import { Component, AfterViewInit, Input, HostListener, HostBinding, ChangeDetectorRef } from "@angular/core";
import { ReteModule } from "rete-angular-plugin/21";

@Component({
  template: ``,
})
export class CustomSocket {
  @Input() data!: any;
  @Input() emit!: any;
  @Input() rendered!: any;

  @HostBinding("title") get title() {
    return this.data.name;
  }

  @HostBinding("style.width") w = "15px";
  @HostBinding("style.height") h = "15px";
  @HostBinding("style.display") d = "block";
  @HostBinding("style.borderRadius") br = "9999px";
  @HostBinding("style.border") border = "2px solid white";
  @HostBinding("style.cursor") cursor = "crosshair";

  @HostBinding("style.background")
  get bg() {
    return this.data?.side === "input" ? "rgb(34,197,94)" : "rgb(99,102,241)";
  }

  @HostBinding("style.boxShadow")
  get sh() {
    console.log("CustomSocket sh data", this.data);
    const c = this.data?.side === "input" ? "rgb(34,197,94)" : "rgb(99,102,241)";
    return `0 0 0 1px ${c}`;
  }


  constructor(private cdr: ChangeDetectorRef) {
    this.cdr.detach();
  }

  ngOnChanges(): void {
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rendered());
  }
}
