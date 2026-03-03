import { Component, Input, HostBinding, ChangeDetectorRef } from "@angular/core";

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
  @HostBinding("style.borderRadius") br = "4px";
  @HostBinding("style.border") border = "1px solid rgba(255,255,255,0.9)";
  @HostBinding("style.cursor") cursor = "crosshair";

  @HostBinding("style.background")
  get bg() {
    return this.socketSide === "input"
      ? "linear-gradient(145deg, #4ade80 0%, #16a34a 100%)"
      : "linear-gradient(145deg, #fb7185 0%, #dc2626 100%)";
  }

  @HostBinding("style.boxShadow")
  get sh() {
    const c = this.socketSide === "input" ? "rgba(22,163,74,0.45)" : "rgba(220,38,38,0.45)";
    return `0 2px 6px ${c}, 0 0 0 1px ${c}`;
  }

  private get socketSide(): "input" | "output" {
    const side = this.data?.__hfSide ?? this.data?.side;
    return side === "output" ? "output" : "input";
  }


  constructor(private cdr: ChangeDetectorRef) {
    this.cdr.detach();
  }

  ngOnChanges(): void {
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rendered());
  }
}
