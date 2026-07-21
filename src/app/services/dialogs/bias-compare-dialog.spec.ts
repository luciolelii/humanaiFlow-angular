import { TestBed } from '@angular/core/testing';
import { BiasCompareDialogService } from './bias-compare-dialog';

describe('BiasCompareDialogService', () => {
  let service: BiasCompareDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BiasCompareDialogService);
  });

  it('opens with the baseline/biased execution pair and closes back to null', () => {
    expect(service.state()).toBeNull();

    service.open({ baselineExecutionId: 'baseline-1', biasedExecutionId: 'variant-1' });
    expect(service.state()).toEqual({ baselineExecutionId: 'baseline-1', biasedExecutionId: 'variant-1' });

    service.close();
    expect(service.state()).toBeNull();
  });
});
