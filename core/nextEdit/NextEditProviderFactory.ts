import { NEXT_EDIT_MODELS } from "../llm/constants.js";
import { BaseNextEditModelProvider } from "./providers/BaseNextEditProvider.js";
import { InstinctProvider } from "./providers/InstinctNextEditProvider.js";
import { MercuryCoderProvider } from "./providers/MercuryCoderNextEditProvider.js";
import { SweepProvider } from "./providers/SweepNextEditProvider.js";

export class NextEditProviderFactory {
  static createProvider(modelName: string): BaseNextEditModelProvider {
    if (modelName.includes(NEXT_EDIT_MODELS.MERCURY_CODER)) {
      return new MercuryCoderProvider();
    } else if (modelName.includes(NEXT_EDIT_MODELS.INSTINCT)) {
      return new InstinctProvider();
    } else if (modelName.includes(NEXT_EDIT_MODELS.SWEEP)) {
      return new SweepProvider(NEXT_EDIT_MODELS.SWEEP);
    } else if (modelName.includes(NEXT_EDIT_MODELS.FINETUNED)) {
      return new SweepProvider(NEXT_EDIT_MODELS.FINETUNED);
    } else {
      throw new Error(`Unsupported model: ${modelName}`);
    }
  }
}
