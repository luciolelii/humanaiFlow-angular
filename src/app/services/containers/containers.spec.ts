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

  it('caches bias capabilities per container type until a forced refresh', async () => {
    const capabilities = {
      blockType: 'GenericContainer', supported: true, isolatedExperimentSupported: false,
      fullFlowExperimentSupported: true, externalSideEffects: false, configurationDependent: false,
      activationModes: ['INPUT_TRANSFORMATION', 'OUTPUT_TRANSFORMATION']
    };
    const retrieveBiasCapabilities = vi.fn().mockReturnValue(of(capabilities));
    service.containersCallService = { retrieveBiasCapabilities } as unknown as typeof service.containersCallService;

    await expect(new Promise((resolve) => service.retrieveBiasCapabilities('GenericContainer').subscribe(resolve)))
      .resolves.toEqual(capabilities);
    await expect(new Promise((resolve) => service.retrieveBiasCapabilities('GenericContainer').subscribe(resolve)))
      .resolves.toEqual(capabilities);
    expect(retrieveBiasCapabilities).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => service.retrieveBiasCapabilities('GenericContainer', true).subscribe(resolve));
    expect(retrieveBiasCapabilities).toHaveBeenCalledTimes(2);
  });
});
