import { Observable, of } from "rxjs";
import { FieldRetrieverCallServiceBase } from "./field-retriever-call.base";

export class FieldRetrieverCallServiceFake extends FieldRetrieverCallServiceBase {
  private readonly providersByBlockType: Record<string, string[]> = {
    LLM: ["OpenAI", "Anthropic", "OllamaTestProvider"],
  };

  private readonly modelsByProvider: Record<string, string[]> = {
    OpenAI: ["gpt-4.1-mini", "gpt-4.1"],
    Anthropic: ["claude-3-5-sonnet", "claude-3-7-sonnet"],
    OllamaTestProvider: ["sam860/gemma3:270m", "llama3.2:3b"]
  };

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
}
