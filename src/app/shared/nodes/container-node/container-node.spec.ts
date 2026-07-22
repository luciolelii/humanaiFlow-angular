import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { EditorStateHolder } from '@stores/flow-editor';
import { ContainerNodeComponent } from './container-node';

describe('ContainerNodeComponent', () => {
  let component: ContainerNodeComponent;
  let fixture: ComponentFixture<ContainerNodeComponent>;
  let fieldRetriever: FieldRetriever;
  let settingsDialog: NodeSettingsDialogService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContainerNodeComponent],
      providers: [
        {
          provide: BlocksService,
          useValue: {
            biasAnnotationsDescriptor: vi.fn().mockReturnValue(null)
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ContainerNodeComponent);
    component = fixture.componentInstance;
    fieldRetriever = TestBed.inject(FieldRetriever);
    settingsDialog = TestBed.inject(NodeSettingsDialogService);
  });

  it('keeps empty textarea fields visible when schema conditions enable them', () => {
    const schema = {
      type: 'object',
      properties: {
        useLlm: {
          type: 'boolean'
        },
        prompt: {
          type: 'string',
          'x-ui-widget': 'textarea',
          'x-ui-visible-when': { field: 'useLlm', equals: 'true' }
        }
      }
    };

    component.data = {
      data: {
        specificConfiguration: {
          useLlm: true,
          prompt: ''
        },
        inputs: [],
        outputs: []
      }
    };

    (component as any).containerSchema = schema;
    (component as any).containerFieldDefinitions = (component as any).buildContainerFieldDefinitions(schema);

    (component as any).refreshParameterFields();

    expect(component.richContentFields.map((field) => field.path)).toContain('prompt');
  });

  it('restores and syncs persisted expanded-mode state', () => {
    component.data = {
      data: {
        __focusOpen: true,
        specificConfiguration: {},
        inputs: [],
        outputs: []
      }
    };

    (component as any).restorePersistedFocusState();

    expect(component.focusOpen).toBe(true);
    expect(component.data.data.__focusOpen).toBe(true);

    component.toggleFocus();
    expect(component.focusOpen).toBe(false);
    expect(component.data.data.__focusOpen).toBe(false);
  });

  it('loads retriever-backed options for nested LLM descriptor fields', async () => {
    const schema = {
      type: 'object',
      properties: {
        llmDescriptor: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              'x-retriever-name': 'LLM',
              'x-retriever-url': '/retriever/LLM/providers'
            }
          }
        }
      }
    };

    component.data = {
      data: {
        specificConfiguration: {
          llmDescriptor: {
            provider: ''
          }
        },
        inputs: [],
        outputs: []
      }
    };

    (component as any).containerSchema = schema;
    (component as any).containerFieldDefinitions = (component as any).buildContainerFieldDefinitions(schema);

    const retrieveValuesSpy = vi.spyOn(fieldRetriever, 'retrieveValues').mockReturnValue(of(['OpenAI', 'Anthropic']));
    const openSpy = vi.spyOn(settingsDialog, 'open').mockResolvedValue(null);

    await component.openParameterEditor('llmDescriptor.provider');

    expect(retrieveValuesSpy).toHaveBeenCalledWith(
      'LLM',
      'providers',
      {},
      '/retriever/LLM/providers'
    );
    expect(openSpy).toHaveBeenCalled();
    const dialogArg = openSpy.mock.calls.at(-1)?.[0];
    expect(dialogArg).toBeTruthy();
    if (!dialogArg) return;
    expect(dialogArg.fields[0].type).toBe('select');
    expect(dialogArg.fields[0].options).toEqual([
      { label: 'OpenAI', value: 'OpenAI' },
      { label: 'Anthropic', value: 'Anthropic' }
    ]);
  });

  it('clears dependent retriever fields when the parent field changes', async () => {
    const schema = {
      type: 'object',
      properties: {
        llmDescriptor: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              'x-retriever-name': 'LLM',
              'x-retriever-url': '/retriever/LLM/providers'
            },
            model: {
              type: 'string',
              'x-retriever-name': 'LLM',
              'x-retriever-url': '/retriever/LLM/models',
              'x-retriever-depends-on': ['provider']
            }
          }
        }
      }
    };

    component.data = {
      data: {
        specificConfiguration: {
          llmDescriptor: {
            provider: 'OpenAI',
            model: 'gpt-4.1'
          }
        },
        inputs: [],
        outputs: []
      }
    };

    (component as any).containerSchema = schema;
    (component as any).containerFieldDefinitions = (component as any).buildContainerFieldDefinitions(schema);
    vi.spyOn(component as any, 'refreshParameterFields').mockImplementation(() => undefined);
    vi.spyOn(component as any, 'refreshView').mockImplementation(() => undefined);

    const providerDefinition = (component as any).containerFieldDefinitions.find(
      (field: { path: string }) => field.path === 'llmDescriptor.provider'
    );

    await (component as any).applyFieldValue(providerDefinition, 'Anthropic');

    expect(component.data.data.specificConfiguration).toEqual({
      llmDescriptor: {
        provider: 'Anthropic',
        model: ''
      }
    });
  });

  it('has no lane badge when the container has no laneId', () => {
    component.data = { data: { id: 'container-1', specificConfiguration: {}, inputs: [], outputs: [] } };
    expect(component.laneBadge).toBeNull();
  });

  it('does not render a lane badge while swimlanes are disabled', () => {
    const editorState = TestBed.inject(EditorStateHolder);
    editorState.currentFlow.set({
      id: 'flow-1', name: 'Test', visibility: 'PRIVATE', author: 'tester',
      createdAt: new Date(), status: 'DRAFT', updatedAt: new Date(),
      data: {
        blocks: [], containers: [], connections: [], dependencies: [],
        lanes: [{ id: 'lane-hr', name: 'HR', order: 0, color: '#F59F00' }]
      }
    });
    component.data = { data: { id: 'container-1', specificConfiguration: {}, inputs: [], outputs: [], laneId: 'lane-hr' } };

    expect(component.laneBadge).toBeNull();
  });

  it('has no bias annotation badge when the container has no annotations', () => {
    component.data = { data: { id: 'container-1', specificConfiguration: {}, inputs: [], outputs: [] } };
    expect(component.biasAnnotationBadge).toBeNull();
  });

  it('computes the bias annotation badge from the container annotations and the severity catalog', () => {
    const blocks = TestBed.inject(BlocksService) as any;
    blocks.biasAnnotationsDescriptor.mockReturnValue({
      options: {
        severity: [
          { value: 'LOW', label: 'Low' },
          { value: 'HIGH', label: 'High' }
        ]
      }
    });
    component.data = {
      data: {
        id: 'container-1',
        specificConfiguration: {},
        inputs: [],
        outputs: [],
        biasAnnotations: [
          { id: 'a1', severity: 'LOW' },
          { id: 'a2', severity: 'HIGH', behavioralProbe: { activationMode: 'INPUT_TRANSFORMATION', instruction: 'do it' } }
        ]
      }
    };

    expect(component.biasAnnotationBadge).toEqual({
      count: 2,
      hasExecutableProbe: true,
      maxSeverityLabel: 'High'
    });
  });

  it('preserves id, position and bias annotations during container regeneration', async () => {
    const containers = TestBed.inject(ContainersService);
    const replacement = vi.fn().mockResolvedValue(undefined);
    component.data = {
      data: {
        id: 'old-id', typeName: 'GenericContainer', position: { x: 10, y: 20 },
        specificConfiguration: { name: 'Container' }, inputs: [], outputs: [],
        biasAnnotations: [{ id: 'bias-1', category: 'DYNAMIC', issue: 'keep me' }],
        replaceWithCreatedNode: replacement
      }
    };
    vi.spyOn(containers, 'createContainer').mockReturnValue(of({
      id: 'old-id', name: 'Generated', typeName: 'GenericContainer', inputs: [], outputs: [],
      specificConfiguration: { name: 'Container' }, position: { x: 99, y: 99 }, nodeFamily: 'container'
    }));

    await (component as any).recreateContainer({ name: 'Container' });

    expect(replacement).toHaveBeenCalledWith(expect.objectContaining({
      position: { x: 10, y: 20 },
      biasAnnotations: [{ id: 'bias-1', category: 'DYNAMIC', issue: 'keep me' }]
    }));
  });
});
