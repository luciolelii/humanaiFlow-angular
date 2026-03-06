import { TestBed } from '@angular/core/testing';

import { FieldRetriever } from './field-retriever';

describe('FieldRetriever', () => {
  let service: FieldRetriever;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FieldRetriever);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
