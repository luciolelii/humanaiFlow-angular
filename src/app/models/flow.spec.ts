import { normalizeFlowValidationErrors } from './flow';

describe('normalizeFlowValidationErrors', () => {
  it('keeps explicit related node ids when provided', () => {
    expect(
      normalizeFlowValidationErrors([{
        entity: 'flow',
        id: 'flow-1',
        message: 'Validation error',
        relatedNodeIds: ['node-1', 'node-2', 'node-1']
      }])
    ).toEqual([{
      code: null,
      entity: 'flow',
      id: 'flow-1',
      field: null,
      message: 'Validation error',
      relatedNodeIds: ['node-1', 'node-2']
    }]);
  });

  it('derives node ids from block and container validation errors', () => {
    expect(
      normalizeFlowValidationErrors([
        { entity: 'block', id: 'block-1', message: 'Broken block' },
        { entity: 'container', id: 'container-1', message: 'Broken container' }
      ])
    ).toEqual([
      {
        code: null,
        entity: 'block',
        id: 'block-1',
        field: null,
        message: 'Broken block',
        relatedNodeIds: ['block-1']
      },
      {
        code: null,
        entity: 'container',
        id: 'container-1',
        field: null,
        message: 'Broken container',
        relatedNodeIds: ['container-1']
      }
    ]);
  });

  it('does not highlight flow-level validation errors without node references', () => {
    expect(
      normalizeFlowValidationErrors([{
        entity: 'flow',
        id: 'flow-1',
        field: 'globalInputs',
        message: 'Missing global input'
      }])
    ).toEqual([{
      code: null,
      entity: 'flow',
      id: 'flow-1',
      field: 'globalInputs',
      message: 'Missing global input',
      relatedNodeIds: []
    }]);
  });
});
