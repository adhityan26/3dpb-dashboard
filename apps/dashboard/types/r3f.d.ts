// @react-three/fiber v9 + React 19: the three.js JSX intrinsics (<mesh>,
// <meshStandardMaterial>, …) must be registered on React's JSX namespace
// explicitly — without this, `next build`'s type check fails with
// "Property 'mesh' does not exist on type 'JSX.IntrinsicElements'".
import { ThreeElements } from "@react-three/fiber"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
