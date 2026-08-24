// opentype.js@2.0.0 ships no type declarations and there is no published
// @types/opentype.js package. This is a minimal ambient shim covering only
// the surface `lib/ring-resizer/mesh/text.ts` actually uses, verified
// against the runtime source at
// node_modules/opentype.js/dist/opentype.js (Path.prototype.moveTo /
// lineTo / curveTo / quadTo / close push {type, x, y, x1, y1, x2, y2} command
// objects; Font.prototype.charToGlyphIndex returns 0 for a missing glyph;
// parseBuffer accepts an ArrayBuffer).
declare module "opentype.js" {
  export type PathCommand =
    | { type: "M"; x: number; y: number }
    | { type: "L"; x: number; y: number }
    | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: "Q"; x1: number; y1: number; x: number; y: number }
    | { type: "Z" }

  export interface Path {
    commands: PathCommand[]
  }

  export interface Font {
    charToGlyphIndex(char: string): number
    getPath(text: string, x: number, y: number, fontSize: number): Path
  }

  export function parse(buffer: ArrayBuffer): Font
}
