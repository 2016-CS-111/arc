import type {
  EmbeddingModelRequest,
  EmbeddingModelResult,
  EmbeddingModelStatus,
} from "../domain/embedding-model.types.js";

export interface EmbeddingModelPort {
  getStatus(signal?: AbortSignal): Promise<EmbeddingModelStatus>;
  embed(request: EmbeddingModelRequest, signal?: AbortSignal): Promise<EmbeddingModelResult>;
}
