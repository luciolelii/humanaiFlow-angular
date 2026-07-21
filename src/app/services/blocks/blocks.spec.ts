import { TestBed } from '@angular/core/testing';
import { throwError, of } from 'rxjs';
import { vi } from 'vitest';

import { BlocksService } from './blocks';

describe('BlocksService', () => {
  let service: BlocksService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BlocksService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('retries loading the block catalog after a failed initial fetch', async () => {
    const retrieveAllBlocksTypes = vi.fn()
      .mockReturnValueOnce(throwError(() => new Error('network down')))
      .mockReturnValueOnce(of([]));
    service.blocksCallService = { retrieveAllBlocksTypes } as unknown as typeof service.blocksCallService;

    await expect(service.getAllBlocksTypes()).rejects.toThrow('network down');
    expect(retrieveAllBlocksTypes).toHaveBeenCalledTimes(1);

    await service.getAllBlocksTypes();
    expect(retrieveAllBlocksTypes).toHaveBeenCalledTimes(2);
  });
});
