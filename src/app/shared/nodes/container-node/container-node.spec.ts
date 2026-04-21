import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { ContainerNodeComponent } from './container-node';

describe('ContainerNodeComponent', () => {
  let component: ContainerNodeComponent;
  let fixture: ComponentFixture<ContainerNodeComponent>;
  let fieldRetriever: FieldRetriever;
  let settingsDialog: NodeSettingsDialogService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContainerNodeComponent]
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
});
