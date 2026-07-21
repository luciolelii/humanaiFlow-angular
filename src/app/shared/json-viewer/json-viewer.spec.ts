import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JsonViewerComponent } from './json-viewer';

describe('JsonViewerComponent', () => {
  let fixture: ComponentFixture<JsonViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [JsonViewerComponent] }).compileComponents();
    fixture = TestBed.createComponent(JsonViewerComponent);
  });

  it('renders an expandable recursive object tree', () => {
    fixture.componentInstance.value = { answer: { enabled: true }, values: [1, 2] };
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Object (2)');
    expect(text).toContain('answer');
    expect(text).toContain('enabled');
    expect(text).toContain('true');
    expect(text).toContain('[0]');
  });

  it('formats primitive strings as JSON strings', () => {
    expect(fixture.componentInstance.formatPrimitive('hello')).toBe('"hello"');
    expect(fixture.componentInstance.formatPrimitive(null)).toBe('null');
  });
});
