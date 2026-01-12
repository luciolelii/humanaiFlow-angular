import { TestBed } from '@angular/core/testing';

import { Flows } from './flows';

describe('Flows', () => {
  let service: Flows;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Flows);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
