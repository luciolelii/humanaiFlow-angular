import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BiasOutputDiffComponent } from './bias-output-diff';

describe('BiasOutputDiffComponent', () => {
  let fixture: ComponentFixture<BiasOutputDiffComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BiasOutputDiffComponent] }).compileComponents();
    fixture = TestBed.createComponent(BiasOutputDiffComponent);
  });

  it('renders text baseline and every biased variant side by side', () => {
    fixture.componentInstance.baselineOutput = 'neutral';
    fixture.componentInstance.biasedOutputs = ['biased one', 'biased two'];
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('neutral');
    expect(text).toContain('Biased output 1');
    expect(text).toContain('Biased output 2');
  });

  it('uses the JSON viewer for complex outputs', () => {
    fixture.componentInstance.baselineOutput = { result: true };
    fixture.componentInstance.biasedOutputs = [{ result: false }];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-json-viewer').length).toBe(2);
  });
});
