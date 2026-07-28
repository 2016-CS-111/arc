export interface SourceCodeRange {
  readonly endByte: number;
  readonly endColumnByte: number;
  readonly endLine: number;
  readonly startByte: number;
  readonly startColumnByte: number;
  readonly startLine: number;
}
