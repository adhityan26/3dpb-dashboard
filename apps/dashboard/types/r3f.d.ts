// Ensure this file is a MODULE (not an ambient script): without a top-level
// export, `declare module "react"` would REPLACE the react module instead of
// augmenting it, wiping every react export from the type system.
export {}

// @react-three/fiber v9 + React 19: register only the three.js JSX intrinsics
// this app actually uses, typed loosely. A blanket `extends ThreeElements`
// augmentation is NOT safe here — fiber's types resolve against a second
// @types/react instance under pnpm's isolated node_modules, and merging them
// into React's JSX namespace poisons the HTML intrinsics (e.g. <div> props
// start failing `next build`'s type check with LegacyRef mismatches).
// Adding new keys with a permissive shape cannot affect existing elements.
type ThreeIntrinsicProps = { [prop: string]: unknown } & {
  children?: import("react").ReactNode
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: ThreeIntrinsicProps
      boxGeometry: ThreeIntrinsicProps
      circleGeometry: ThreeIntrinsicProps
      directionalLight: ThreeIntrinsicProps
      group: ThreeIntrinsicProps
      mesh: ThreeIntrinsicProps
      meshBasicMaterial: ThreeIntrinsicProps
      meshStandardMaterial: ThreeIntrinsicProps
      ringGeometry: ThreeIntrinsicProps
    }
  }
}
