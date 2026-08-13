declare module "pptx-browser" {
  export class PptxRenderer {
    slideCount: number;
    slideSize: { cx: number; cy: number };
    load(
      source: File | Blob | ArrayBuffer | Uint8Array,
      onProgress?: (progress: number, message: string) => void,
    ): Promise<void>;
    renderSlide(
      index: number,
      canvas: HTMLCanvasElement | OffscreenCanvas,
      width?: number,
    ): Promise<void>;
    registerFont(
      family: string,
      source: string | URL | File | Blob | ArrayBuffer | Uint8Array,
      descriptors?: { weight?: string; style?: string },
    ): Promise<void>;
    registerFonts(
      fontMap: Record<
        string,
        | string
        | Array<{
            src: string;
            weight?: string;
            style?: string;
          }>
      >,
    ): Promise<void>;
    toPdf(opts?: {
      width?: number;
      quality?: number;
      slides?: number[];
      onProgress?: (done: number, total: number) => void;
    }): Promise<Uint8Array>;
    destroy(): void;
  }
}
