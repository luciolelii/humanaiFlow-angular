import { Observable, of } from "rxjs";
import { FieldRetrieverCallServiceBase, RetrieverStructuredItem } from "./field-retriever-call.base";

export class FieldRetrieverCallServiceFake extends FieldRetrieverCallServiceBase {
  private readonly providersByBlockType: Record<string, string[]> = {
    LLM: ["OpenAI", "Anthropic", "OllamaTestProvider"],
  };

  private readonly modelsByProvider: Record<string, string[]> = {
    OpenAI: ["gpt-4.1-mini", "gpt-4.1"],
    Anthropic: ["claude-3-5-sonnet", "claude-3-7-sonnet"],
    OllamaTestProvider: ["sam860/gemma3:270m", "llama3.2:3b"]
  };

  private readonly subFlowItems = [
    {
      descriptor: {
        label: 'Containerized Candidate Review',
        description: 'Collect candidate text and run internal analysis'
      },
      data: {
        blocks: [
          {
            id: 'fake-source',
            name: 'Collect Candidate',
            position: { x: 40, y: 60 },
            inputs: [],
            outputs: [{ name: 'candidate', type: 'TEXT', multiple: false, valueKinds: [{ type: 'TEXT', multiple: false }] }],
            specificConfiguration: { name: 'Collect Candidate' },
            typeName: 'SourceBlock',
            nodeFamily: 'block'
          },
          {
            id: 'fake-analysis',
            name: 'Analyze Candidate',
            position: { x: 240, y: 120 },
            inputs: [{ name: 'candidate', type: 'TEXT', multiple: false, valueKinds: [{ type: 'TEXT', multiple: false }] }],
            outputs: [{ name: 'response', type: 'TEXT', multiple: false, valueKinds: [{ type: 'TEXT', multiple: false }] }],
            specificConfiguration: { name: 'Analyze Candidate' },
            typeName: 'LLMBlock',
            nodeFamily: 'block'
          }
        ],
        containers: [],
        connections: [
          {
            id: 'fake-connection',
            sourceId: 'fake-source',
            sourceName: 'candidate',
            targetId: 'fake-analysis',
            targetName: 'candidate'
          }
        ]
      },
      structuredData: true,
      valid: true,
      validationErrors: []
    }
  ];

  private readonly sharedExecutionVariableItems = [
    {
      descriptor: {
        label: 'Primary MCP Session',
        description: 'Shared by MCPAgent Producer',
        meta: {
          kind: 'MCP_SESSION',
          producerBlockId: 'mcp-producer-1',
          producerBlockName: 'MCPAgent Producer'
        }
      },
      data: 'primary-mcp-session',
      structuredData: true,
      valid: true,
      validationErrors: []
    },
    {
      descriptor: {
        label: 'Support MCP Session',
        description: 'Shared by MCPAgentChat Support',
        meta: {
          kind: 'MCP_SESSION',
          producerBlockId: 'mcp-chat-1',
          producerBlockName: 'MCPAgentChat Support'
        }
      },
      data: 'support-mcp-session',
      structuredData: true,
      valid: true,
      validationErrors: []
    }
  ];

  override retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    _retrieverUrl?: string | null
  ): Observable<string[]> {
    if (key === "providers") {
      return of(this.providersByBlockType[blockType] ?? []);
    }

    if (key === "models") {
      const provider = context?.["provider"];
      return of(provider ? (this.modelsByProvider[provider] ?? []) : []);
    }

    return of([]);
  }

  override retrieveItems<T = unknown>(
    _blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ): Observable<RetrieverStructuredItem<T>[]> {
    if (key === 'subFlow' || retrieverUrl?.includes('/Flows/subFlow/items')) {
      return of(this.subFlowItems as unknown as RetrieverStructuredItem<T>[]);
    }
    if (
      key === 'shared'
      || retrieverUrl?.includes('/ExecutionVariables/shared/items')
    ) {
      const kind = context?.['kind'] ?? this.readQueryParam(retrieverUrl, 'kind');
      if (kind === 'MCP_SESSION') {
        return of(this.sharedExecutionVariableItems as unknown as RetrieverStructuredItem<T>[]);
      }
    }
    return of([]);
  }

  override isFieldRequired(
    _blockType: string,
    _key: string,
    context?: Record<string, string>,
    _retrieverUrl?: string | null
  ): Observable<boolean> {
    void context;
    return of(false);
  }

  override retrieveSchema(
    schemaUrl: string,
    context?: Record<string, string>
  ): Observable<Record<string, unknown> | null> {
    if (!schemaUrl.includes('/retriever/MCPServers/definitions/schema')) {
      return of(null);
    }

    const serverName = context?.['serverName'] ?? '';
    if (!serverName) {
      return of(null);
    }

    return of({
      type: 'object',
      properties: {
        endpoint: {
          type: 'string'
        },
        tool: {
          type: 'string',
          default: `${serverName}-default`
        },
        enabled: {
          type: 'boolean',
          default: true
        }
      }
    });
  }

  private readQueryParam(url: string | null | undefined, key: string): string | null {
    if (typeof url !== 'string' || url.trim().length === 0) return null;
    const queryString = url.split('?', 2)[1];
    if (!queryString) return null;
    const params = new URLSearchParams(queryString);
    const value = params.get(key);
    return value && value.trim().length > 0 ? value.trim() : null;
  }
}
