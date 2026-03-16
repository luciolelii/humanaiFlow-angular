import { Component, HostBinding, Input } from "@angular/core";

@Component({
  template: ``,
})
export class CustomSocket {
  @Input() data!: any;
  @Input() emit!: any;
  @Input() rendered!: any;
  private side: "input" | "output" = "input";

  @HostBinding("title") get title() {
    return this.data.name;
  }

  @HostBinding("style.width") w = "15px";
  @HostBinding("style.height") h = "15px";
  @HostBinding("style.display") d = "block";
  @HostBinding("style.borderRadius") br = "4px";
  @HostBinding("style.border") border = "1px solid rgba(255,255,255,0.9)";
  @HostBinding("style.cursor") get cursor() {
    return this.data?.__readonly === true ? "default" : "crosshair";
  }

  @HostBinding("style.pointerEvents") get pointerEvents() {
    return this.data?.__readonly === true ? "none" : "auto";
  }

  @HostBinding("style.background")
  get bg() {
    return this.side === "input"
      ? "linear-gradient(145deg, #4ade80 0%, #16a34a 100%)"
      : "linear-gradient(145deg, #fb7185 0%, #dc2626 100%)";
  }

  @HostBinding("style.boxShadow")
  get sh() {
    const c = this.side === "input" ? "rgba(22,163,74,0.45)" : "rgba(220,38,38,0.45)";
    return `0 2px 6px ${c}, 0 0 0 1px ${c}`;
  }

  private resolveSocketSide(): "input" | "output" {
    const side = this.data?.__hfSide ?? this.data?.side;
    return side === "output" ? "output" : "input";
  }

  ngOnChanges(): void {
    this.side = this.resolveSocketSide();
    requestAnimationFrame(() => this.rendered());
  }
}
