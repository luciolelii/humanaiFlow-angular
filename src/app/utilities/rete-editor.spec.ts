import { DEFAULT_NODE_CAPABILITIES } from '@models/flow';
import { HFNode } from '@models/nodes';
import { vi } from 'vitest';

import { resolveNodeCapabilities, ReteRuntimeContext } from './rete-editor';

function makeNode(typeName: string, nodeFamily: 'block' | 'container'): HFNode {
  return { data: { typeName, nodeFamily } } as unknown as HFNode;
}

function makeRuntime(overrides: Partial<ReteRuntimeContext> = {}): ReteRuntimeContext {
  return {
    blocksService: { peekBlockType: vi.fn().mockReturnValue(null) } as any,
    containersService: { peekContainerType: vi.fn().mockReturnValue(null) } as any,
    flowState: {} as any,
    readonly: false,
    globalInputs: [],
    lanes: [],
    ...overrides
  };
}

describe('resolveNodeCapabilities', () => {
  it('falls back to DEFAULT_NODE_CAPABILITIES when there is no runtime, node or typeName', () => {
    expect(resolveNodeCapabilities(undefined, makeNode('LLMBlock', 'block'))).toEqual(DEFAULT_NODE_CAPABILITIES);
    expect(resolveNodeCapabilities(makeRuntime(), undefined)).toEqual(DEFAULT_NODE_CAPABILITIES);
    expect(resolveNodeCapabilities(makeRuntime(), makeNode('', 'block'))).toEqual(DEFAULT_NODE_CAPABILITIES);
  });

  it('falls back to DEFAULT_NODE_CAPABILITIES when the descriptor has none', () => {
    const runtime = makeRuntime();
    expect(resolveNodeCapabilities(runtime, makeNode('LLMBlock', 'block'))).toEqual(DEFAULT_NODE_CAPABILITIES);
  });

  it('resolves capabilities for a block node via blocksService.peekBlockType', () => {
    const endBlockCapabilities = {
      visualRole: 'END' as const,
      terminal: true,
      biasAnnotationsAllowed: false,
      allowsIncomingConnections: true,
      allowsOutgoingConnections: false,
      canDependOnOtherNodes: false,
      canHaveDependentNodes: false
    };
    const peekBlockType = vi.fn().mockReturnValue({ type: 'EndBlock', capabilities: endBlockCapabilities });
    const runtime = makeRuntime({ blocksService: { peekBlockType } as any });

    expect(resolveNodeCapabilities(runtime, makeNode('EndBlock', 'block'))).toEqual(endBlockCapabilities);
    expect(peekBlockType).toHaveBeenCalledWith('EndBlock');
  });

  it('resolves capabilities for a container node via containersService.peekContainerType, not blocksService', () => {
    const peekBlockType = vi.fn().mockReturnValue(null);
    const peekContainerType = vi.fn().mockReturnValue({
      type: 'GenericContainer',
      capabilities: { ...DEFAULT_NODE_CAPABILITIES, visualRole: 'CONTAINER' as const }
    });
    const runtime = makeRuntime({
      blocksService: { peekBlockType } as any,
      containersService: { peekContainerType } as any
    });

    expect(resolveNodeCapabilities(runtime, makeNode('GenericContainer', 'container')))
      .toEqual({ ...DEFAULT_NODE_CAPABILITIES, visualRole: 'CONTAINER' });
    expect(peekContainerType).toHaveBeenCalledWith('GenericContainer');
    expect(peekBlockType).not.toHaveBeenCalled();
  });
});
