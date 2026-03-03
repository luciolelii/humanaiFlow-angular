import { Observable, of } from "rxjs";
import { FieldRetreiverCallServiceBase } from "./field-retreiver-call.base";

export class FieldRetreiverCallServiceFake extends FieldRetreiverCallServiceBase {
  private readonly providersByBlockType: Record<string, string[]> = {
    LLMBlock: ["OpenAI", "Anthropic", "OllamaTestProvider"],
    HumanInteractionBlock: ["OpenAI", "OllamaTestProvider"]
  };

  private readonly modelsByProvider: Record<string, string[]> = {
    OpenAI: ["gpt-4.1-mini", "gpt-4.1"],
    Anthropic: ["claude-3-5-sonnet", "claude-3-7-sonnet"],
    OllamaTestProvider: ["sam860/gemma3:270m", "llama3.2:3b"]
  };

  override retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>
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
    blockType: string,
    key: string,
    context?: Record<string, string>
  ): Observable<boolean> {
    if (key !== "authorization") {
      return of(false);
    }

    const provider = context?.["provider"] ?? "";
    if (blockType === "LLMBlock") {
      return of(provider === "Anthropic");
    }

    return of(false);
  }
}
