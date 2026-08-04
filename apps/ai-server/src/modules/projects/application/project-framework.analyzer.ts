import type {
  AnalyzeProjectFrameworkFileInput,
  ProjectFrameworkAnalysisResult,
} from "../domain/project-framework-analysis.types.js";
import type { ProjectFrameworkKind } from "../domain/project-framework.types.js";

export interface ProjectFrameworkAnalyzer {
  readonly framework: ProjectFrameworkKind;
  analyze(input: AnalyzeProjectFrameworkFileInput): ProjectFrameworkAnalysisResult;
  getAnalyzerIdentity(): string;
}
