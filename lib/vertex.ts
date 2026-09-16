export interface VisionCandidate {
  projectName: string;
  productLine: string;
  grade: string;
  subject: string;
  materialType: string;
  colors: string[];
  visualStyle: string;
  layoutFeatures: string;
  coreElements: string[];
  ocrText: string;
  description: string;
  suiteHint: string;
  relationHint: string;
  confidence: number;
  reuseSuggestion: "REUSABLE" | "ADAPT_REQUIRED" | "NOT_REUSABLE";
}

/** Boundary for Gemini analysis. The worker supplies a signed preview URL, never the raw source asset. */
export async function analysePreview(previewUrl: string): Promise<VisionCandidate> {
  if (!process.env.VERTEX_PROJECT_ID) throw new Error("VERTEX_PROJECT_ID is required for live analysis");
  // Vertex request wiring belongs in the worker process. Keeping the contract here makes retries and mocks deterministic.
  void previewUrl;
  throw new Error("Vertex adapter is not configured in this local demo");
}

/** Both image and text embeddings use the same Vertex multimodalembedding vector space (1408 dimensions). */
export async function embedReference(input: { imageUrl?: string; text?: string }): Promise<number[]> {
  if (!process.env.VERTEX_PROJECT_ID) throw new Error("VERTEX_PROJECT_ID is required for live embedding");
  void input;
  throw new Error("Vertex adapter is not configured in this local demo");
}
