import { FlowData } from '@models/flow';
import {
  listFlowSubflows,
  replaceFlowSubflow,
  resolveFlowSubflow
} from './flow-subflows';

function emptyFlowData(): FlowData {
  return { blocks: [], containers: [], connections: [], dependencies: [] };
}

describe('flow subflow utilities', () => {
  it('lists all FlowData fields in container configuration as hierarchy entries', () => {
    const root = emptyFlowData();
    root.containers = [{
      id: 'loop-1',
      name: 'Review loop',
      typeName: 'LoopContainer',
      nodeFamily: 'container',
      inputs: [],
      outputs: [],
      specificConfiguration: {
        subFlow: emptyFlowData(),
        guardSubFlow: emptyFlowData()
      }
    }];

    expect(listFlowSubflows(root).map((entry) => entry.label)).toEqual([
      'Review loop · Sub Flow',
      'Review loop · Guard Sub Flow'
    ]);
  });

  it('recognizes backend subflows that omit empty dependencies', () => {
    const root = emptyFlowData();
    root.containers = [{
      id: 'container-1',
      name: 'Backend container',
      typeName: 'GenericContainer',
      nodeFamily: 'container',
      inputs: [],
      outputs: [],
      specificConfiguration: {
        subFlow: {
          blocks: [],
          containers: [],
          connections: []
        }
      }
    }];

    expect(listFlowSubflows(root)).toHaveLength(1);
    expect(listFlowSubflows(root)[0].label).toBe('Backend container · Sub Flow');
  });

  it('recognizes real API subflows with nullable collections', () => {
    const root = emptyFlowData();
    root.containers = [{
      id: 'iterator-1',
      name: 'score-cvs',
      typeName: 'IteratorContainer',
      nodeFamily: 'container',
      inputs: [],
      outputs: [],
      specificConfiguration: {
        type: 'IteratorContainerConfiguration',
        name: 'score-cvs',
        subFlow: {
          blocks: [{
            id: 'score-cv',
            name: 'score-cv',
            typeName: 'LLMBlock',
            inputs: [],
            outputs: [],
            specificConfiguration: {}
          }],
          containers: null,
          connections: [],
          dependencies: null,
          globalInputs: null,
          lanes: null
        }
      }
    }];

    const entries = listFlowSubflows(root);

    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('score-cvs · Sub Flow');
    expect(resolveFlowSubflow(root, entries[0].locator)?.blocks[0].id).toBe('score-cv');
  });

  it('replaces a selected subflow without changing the original root object', () => {
    const root = emptyFlowData();
    const originalSubflow = emptyFlowData();
    root.containers = [{
      id: 'container-1',
      name: 'Container',
      typeName: 'Container',
      nodeFamily: 'container',
      inputs: [],
      outputs: [],
      specificConfiguration: { subFlow: originalSubflow }
    }];
    const entry = listFlowSubflows(root)[0];
    const replacement = {
      ...emptyFlowData(),
      globalInputs: [{ name: 'topic', type: 'TEXT', multiple: false }]
    };

    const updated = replaceFlowSubflow(root, entry.locator, replacement);

    expect(updated).not.toBe(root);
    expect(resolveFlowSubflow(updated!, entry.locator)?.globalInputs).toEqual(replacement.globalInputs);
    expect(resolveFlowSubflow(root, entry.locator)).toBe(originalSubflow);
  });
});
