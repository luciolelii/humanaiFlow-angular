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

  it('shows the external side effect banner only when the block has external side effects', () => {
    fixture.componentRef.setInput('externalSideEffects', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side-effect-policy-selector__alert')).toBeNull();

    fixture.componentRef.setInput('externalSideEffects', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side-effect-policy-selector__alert')).not.toBeNull();
  });

  it('warns about the explicit confirmation step for the require-confirmation policy', () => {
    fixture.componentInstance.policy = 'REQUIRE_CONFIRMATION';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('asked to confirm');
  });

  it('does not emit while disabled', () => {
    const emitted: string[] = [];
    fixture.componentInstance.policyChange.subscribe((policy) => emitted.push(policy));
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    fixture.componentInstance.select('MOCK');

    expect(emitted).toEqual([]);
  });
});
