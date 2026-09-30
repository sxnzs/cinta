export type Step =
  | { type: "cmd"; text: string }
  | { type: "out"; text: string; cls?: string }
  | { type: "stream"; lines: string[] }
  | { type: "gap" }
  | { type: "pause"; ms: number }
  | { type: "done" };

export interface Colors {
  bg?: string;
  panel?: string;
  ink?: string;
  dim?: string;
  faint?: string;
  accent?: string;
  border?: string;
  bar?: string;
}

export interface Timing {
  typeMs?: number;
  lineMs?: number;
  afterCmdMs?: number;
  endHoldMs?: number;
}

export interface RenderOptions {
  out?: string;
  name?: string;
  tag?: string;
  title?: string;
  sub?: string[];
  fps?: number;
  scale?: number;
  width?: number;
  height?: number;
  font?: string;
  colors?: Colors;
  timing?: Timing;
  chromePath?: string;
  signal?: AbortSignal;
}

export interface RenderResult {
  gif: string;
  html: string;
  frames: number;
  durationMs: number;
  width: number;
  height: number;
  bytes: number;
}

export declare const DEFAULTS: Required<Pick<RenderOptions, "fps" | "scale" | "width" | "height" | "font">> & {
  colors: Required<Colors>;
  timing: Required<Timing>;
};
export declare function findChrome(): string | undefined;
export declare function renderGif(script: readonly Step[], options?: RenderOptions): Promise<RenderResult>;
