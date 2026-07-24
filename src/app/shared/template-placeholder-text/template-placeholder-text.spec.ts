import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TemplatePlaceholderTextComponent } from './template-placeholder-text';

function textContent(fixture: ComponentFixture<TemplatePlaceholderTextComponent>, selector: string): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<Element>)
    .map((el) => el.textContent?.trim() ?? '');
}

describe('TemplatePlaceholderTextComponent', () => {
  let fixture: ComponentFixture<TemplatePlaceholderTextComponent>;
  let component: TemplatePlaceholderTextComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplatePlaceholderTextComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(TemplatePlaceholderTextComponent);
    component = fixture.componentInstance;
  });

  it('never shows the literal ${{...}} placeholder syntax', () => {
    fixture.componentRef.setInput('text', 'Profile:\n${{candidateProfile}}\nReview it.');
    fixture.componentRef.setInput('values', { candidateProfile: 'Jane Doe' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('${{');
    expect(textContent(fixture, '.tpl-text').join(' ')).toContain('Profile:');
    expect(textContent(fixture, '.tpl-value-card')[0]).toContain('Jane Doe');
  });

  it('truncates a long single value with an expand toggle, not shown inline in full', () => {
    const longValue = 'x'.repeat(250);
    fixture.componentRef.setInput('text', '${{notes}}');
    fixture.componentRef.setInput('values', { notes: longValue });
    fixture.detectChanges();

    const body = fixture.nativeElement.querySelector('.tpl-value-card div.mt-1') as HTMLElement;
    expect(body.textContent?.length).toBeLessThan(longValue.length);
    expect(body.textContent).toContain('…');

    const button = fixture.nativeElement.querySelector('.tpl-value-card button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Show all');
    button.click();
    fixture.detectChanges();

    const expandedBody = fixture.nativeElement.querySelector('.tpl-value-card div.mt-1') as HTMLElement;
    expect(expandedBody.textContent).toBe(longValue);
  });

  it('shows an explicit empty-state instead of a blank hole for a missing value', () => {
    fixture.componentRef.setInput('text', '${{global.cvs}}');
    fixture.componentRef.setInput('values', {});
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No data available');
  });

  it('renders a multiple placeholder as a collapsed-by-default accordion, one item per array entry', () => {
    fixture.componentRef.setInput('text', 'CVs:\n${{global.cvs[]}}');
    fixture.componentRef.setInput('values', { 'global.cvs': ['cv one', 'cv two', 'cv three'] });
    fixture.detectChanges();

    const headers = textContent(fixture, '.tpl-array-item-label');
    expect(headers).toEqual(['Cvs 1 of 3', 'Cvs 2 of 3', 'Cvs 3 of 3']);
    expect(fixture.nativeElement.querySelectorAll('.tpl-array-item .border-t').length).toBe(0);

    (fixture.nativeElement.querySelectorAll('.tpl-array-item-header')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.tpl-array-item .border-t').length).toBe(1);
  });

  it('expands and collapses every array item at once', () => {
    fixture.componentRef.setInput('text', '${{items[]}}');
    fixture.componentRef.setInput('values', { items: ['a', 'b', 'c'] });
    fixture.detectChanges();

    const expandAllButton = fixture.nativeElement.querySelector('.tpl-array button.tpl-link') as HTMLButtonElement;
    expect(expandAllButton.textContent?.trim()).toBe('Expand all');
    expandAllButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.tpl-array-item .border-t').length).toBe(3);
    expect(expandAllButton.textContent?.trim()).toBe('Collapse all');

    expandAllButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.tpl-array-item .border-t').length).toBe(0);
  });

  it('treats an empty array the same as a missing value', () => {
    fixture.componentRef.setInput('text', '${{global.cvs[]}}');
    fixture.componentRef.setInput('values', { 'global.cvs': [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No data available');
    expect(fixture.nativeElement.querySelectorAll('.tpl-array-item').length).toBe(0);
  });

  it('does not render an empty paragraph between two adjacent placeholders', () => {
    fixture.componentRef.setInput('text', '${{a}}${{b}}');
    fixture.componentRef.setInput('values', { a: '1', b: '2' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.tpl-text').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.tpl-value-card').length).toBe(2);
  });
});
