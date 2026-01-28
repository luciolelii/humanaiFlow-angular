import { Component, ElementRef, HostBinding, Input } from '@angular/core';
import { ReteModule } from 'rete-angular-plugin/21';

@Component({
  standalone: true,
  imports: [ReteModule],
  host: {
    refComponent: '',
    class: `
      cursor-pointer relative -right-1 w-[15px] h-[15px] flex items-center justify-center rounded-full bg-indigo-500 border-2 border-white
           shadow-[0_0_0_1px_rgb(99,102,241)]
      `
  },
  template: ``
})
export class OutputSocket {
  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  @HostBinding("title") get title() {
    return this.data?.name ?? "";
  }

  ngOnInit(): void {
    console.log("OutputSocket ngOnInit", this.data);
  }

 ngAfterViewInit() {
  requestAnimationFrame(() => {
    this.rendered?.();
  });
}
}