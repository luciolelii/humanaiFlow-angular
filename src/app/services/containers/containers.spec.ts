import { TestBed } from '@angular/core/testing';
import { throwError, of } from 'rxjs';
import { vi } from 'vitest';

import { ContainersService } from './containers';

describe('ContainersService', () => {
  let service: ContainersService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ContainersService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('retries loading the container catalog after a failed initial fetch', async () => {
    const retrieveAllContainerTypes = vi.fn()
      .mockReturnValueOnce(throwError(() => new Error('network down')))
      .mockReturnValueOnce(of([]));
    service.containersCallService = { retrieveAllContainerTypes } as unknown as typeof service.containersCallService;

    await expect(service.getAllContainerTypes()).rejects.toThrow('network down');
    expect(retrieveAllContainerTypes).toHaveBeenCalledTimes(1);

    await service.getAllContainerTypes();
    expect(retrieveAllContainerTypes).toHaveBeenCalledTimes(2);
  });
});
