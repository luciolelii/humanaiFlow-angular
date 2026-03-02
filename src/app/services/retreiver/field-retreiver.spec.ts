import { TestBed } from '@angular/core/testing';

import { FieldRetreiver } from './field-retreiver';

describe('FieldRetreiver', () => {
  let service: FieldRetreiver;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FieldRetreiver);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
