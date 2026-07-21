import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BiasAnnotationsDescriptor } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { EditorStateHolder } from '@stores/flow-editor';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { BiasAnnotationsComponent } from './bias-annotations';

const descriptor: BiasAnnotationsDescriptor = {
  type: 'BiasAnnotation', blockProperty: 'biasAnnotations', multiple: true, maxItems: 2,
  schema: {
    type: 'object', required: ['category', 'issue'], properties: {
      id: { type: 'string', 'x-ui-order': 0 },
      category: { type: 'string', 'x-ui-label': 'Category', 'x-ui-order': 1 },
      issue: { type: 'string', maxLength: 5, 'x-ui-widget': 'textarea', 'x-ui-order': 2 },
      status: { type: 'string', 'x-ui-order': 3 }
    }
  },
  options: {
    category: [{ value: 'DYNAMIC', label: 'Dynamic category', description: 'Loaded from the API' }],
    status: [{ value: 'NEW', label: 'New status' }]
  },
  defaults: { status: 'NEW' }, serverGeneratedFields: ['id']
};

describe('BiasAnnotationsComponent', () => {
  let fixture: ComponentFixture<BiasAnnotationsComponent>;
  let component: BiasAnnotationsComponent;
  const validationErrors = signal<any[]>([]);

  beforeEach(async () => {
    validationErrors.set([]);
    await TestBed.configureTestingModule({
      imports: [BiasAnnotationsComponent],
      providers: [
        {
          provide: BlocksService,
          useValue: {
            biasAnnotationsDescriptor: signal(descriptor),
            retrieveBiasCapabilities: () => of({
              blockType: 'LLMBlock', supported: true, isolatedExperimentSupported: true,
              fullFlowExperimentSupported: true, externalSideEffects: false,
              configurationDependent: false, activationModes: ['PROMPT_DIRECTIVE']
            }),
            retrieveBiasCapabilitiesForInstance: () => of({
              blockType: 'LLMBlock', supported: true, isolatedExperimentSupported: true,
              fullFlowExperimentSupported: true, externalSideEffects: false,
              configurationDependent: false, activationModes: ['PROMPT_DIRECTIVE']
            })
          }
        },
        { provide: EditorStateHolder, useValue: { flowValidationErrors: validationErrors } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(BiasAnnotationsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('blockId', 'block-1');
    fixture.componentRef.setInput('annotations', []);
    fixture.detectChanges();
  });

  it('renders API options and applies defaults without generating an id', () => {
    (fixture.nativeElement.querySelector('.bias-add') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.draft).toEqual({ status: 'NEW' });
    expect(component.fields.map((field) => field.key)).toEqual(['category', 'issue', 'status']);
    expect(fixture.nativeElement.textContent).toContain('Dynamic category');
    component.draft.category = 'DYNAMIC';
    expect(component.optionDescription(component.fields[0])).toBe('Loaded from the API');
  });

  it('enforces required fields and schema maxLength, then adds and edits', () => {
    const emitted = vi.fn();
    component.annotationsChange.subscribe(emitted);
    component.add();
    component.save();
    expect(component.clientErrors['category']).toContain('required');
    component.draft = { category: 'DYNAMIC', issue: '123456', status: 'NEW' };
    component.save();
    expect(component.clientErrors['issue']).toContain('5');
    component.draft.issue = 'valid';
    component.save();
    expect(emitted).toHaveBeenLastCalledWith([{ category: 'DYNAMIC', issue: 'valid', status: 'NEW' }]);

    component.annotations = [{ id: 'server-id', category: 'DYNAMIC', issue: 'old' }];
    component.edit(0);
    component.draft.issue = 'new';
    component.save();
    expect(emitted).toHaveBeenLastCalledWith([{ id: 'server-id', category: 'DYNAMIC', issue: 'new' }]);
  });

  it('removes entries, respects maxItems and is read-only when finalized', () => {
    const emitted = vi.fn();
    component.annotationsChange.subscribe(emitted);
    fixture.componentRef.setInput('annotations', [{ issue: 'one' }, { issue: 'two' }]);
    expect(component.canAdd).toBe(false);
    component.remove(0);
    expect(emitted).toHaveBeenCalledWith([{ issue: 'two' }]);
    fixture.componentRef.setInput('readonly', true);
    component.remove(0);
    expect(emitted).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Add bias annotation');
  });

  it('maps backend validation paths to the matching annotation field', () => {
    validationErrors.set([{ code: 'BIAS_CATEGORY_REQUIRED', id: 'block-1', field: 'biasAnnotations[0].category', message: 'Category required' }]);
    expect(component.serverError(0, 'category')).toBe('Category required');
    expect(component.serverError(1, 'category')).toBeNull();
  });

  it('renders the editor as a native <dialog> so it escapes the node canvas transform, and closing it via the backdrop click works', () => {
    (fixture.nativeElement.querySelector('.bias-add') as HTMLButtonElement).click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog.bias-modal-backdrop') as HTMLDialogElement;
    expect(dialog).not.toBeNull();

    component.onDialogClick({ target: dialog, stopPropagation: vi.fn() } as unknown as MouseEvent);
    expect(component.editorOpen).toBe(false);
  });

  it('does not close when clicking inside the dialog content', () => {
    (fixture.nativeElement.querySelector('.bias-add') as HTMLButtonElement).click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.bias-modal') as HTMLElement;
    component.onDialogClick({ target: form, stopPropagation: vi.fn() } as unknown as MouseEvent);
    expect(component.editorOpen).toBe(true);
  });

  it('maps typed mock-output probe errors to nested fields', () => {
    validationErrors.set([{
      code: 'BIAS_PROBE_MOCK_OUTPUT_TYPE_MISMATCH',
      id: 'block-1',
      field: 'biasAnnotations[0].behavioralProbe.mockOutputs.response',
      message: 'Response must be text'
    }]);
    expect(component.serverError(0, 'behavioralProbe.mockOutputs.response')).toBe('Response must be text');
  });
});
