import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SideEffectPolicySelectorComponent } from './side-effect-policy-selector';

describe('SideEffectPolicySelectorComponent', () => {
  let fixture: ComponentFixture<SideEffectPolicySelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SideEffectPolicySelectorComponent] }).compileComponents();
    fixture = TestBed.createComponent(SideEffectPolicySelectorComponent);
  });

  it('emits the selected policy and explains mock mode', () => {
    const emitted: string[] = [];
    fixture.componentInstance.policyChange.subscribe((policy) => emitted.push(policy));
    fixture.componentInstance.policy = 'MOCK';
    fixture.componentInstance.externalSideEffects = true;
    fixture.detectChanges();
    fixture.componentInstance.select('BLOCK');

    expect(emitted).toEqual(['BLOCK']);
    expect(fixture.nativeElement.textContent).toContain('will not be invoked for real');
  });
});
