import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalShellComponent } from './modal-shell';

@Component({
  standalone: true,
  imports: [ModalShellComponent],
  template: `
    <app-modal-shell title="A title" subtitle="A subtitle" ariaLabel="A dialog" maxWidth="760px"
      (backdropClick)="backdropClicks = backdropClicks + 1" (closeClick)="closeClicks = closeClicks + 1">
      <p class="body-marker">Body content</p>
      <footer><button type="button">Footer button</button></footer>
    </app-modal-shell>
  `
})
class HostComponent {
  backdropClicks = 0;
  closeClicks = 0;
}

describe('ModalShellComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders title, subtitle and aria-label', () => {
    const section = fixture.nativeElement.querySelector('.modal-shell');
    expect(fixture.nativeElement.querySelector('h3').textContent).toBe('A title');
    expect(fixture.nativeElement.querySelector('header p').textContent).toBe('A subtitle');
    expect(section.getAttribute('aria-label')).toBe('A dialog');
  });

  it('projects body content into the default slot and footer into its own slot', () => {
    expect(fixture.nativeElement.querySelector('.modal-shell__content .body-marker')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.modal-shell > footer')).not.toBeNull();
  });

  it('emits backdropClick and closeClick on interaction', () => {
    fixture.nativeElement.querySelector('.modal-shell__backdrop').click();
    fixture.nativeElement.querySelector('header button').click();
    fixture.detectChanges();

    expect(fixture.componentInstance.backdropClicks).toBe(1);
    expect(fixture.componentInstance.closeClicks).toBe(1);
  });

  it('exposes maxWidth as a CSS custom property consumed by the panel width/max-width', () => {
    const section = fixture.nativeElement.querySelector('.modal-shell') as HTMLElement;
    expect(section.style.getPropertyValue('--modal-shell-max-width')).toBe('760px');
  });
});
