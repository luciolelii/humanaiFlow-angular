import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HumanInteractionDialogState } from '@services/dialogs/human-interaction-dialog';
import { HumanTextInteractionComponent } from './human-text-interaction';

describe('HumanTextInteractionComponent', () => {
  let fixture: ComponentFixture<HumanTextInteractionComponent>;
  let component: HumanTextInteractionComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HumanTextInteractionComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(HumanTextInteractionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('state', {
      kind: 'single-response',
      actionDescription: 'Provide the candidate profile',
      runtimeInputs: [{ name: 'input', value: 'Runtime context' }],
      isSubmitting: false,
      isRunning: false,
      submitError: null
    } as HumanInteractionDialogState);
    fixture.detectChanges();
  });

  it('rejects an empty response and emits a trimmed textual response', () => {
    const emitted: string[] = [];
    component.submitResponse.subscribe((value) => emitted.push(value));

    component.draftValue = '   ';
    component.submit();
    expect(emitted).toEqual([]);

    component.draftValue = '  Candidate profile  ';
    component.submit();
    expect(emitted).toEqual(['Candidate profile']);
  });
});
