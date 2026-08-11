// Shared parameter definitions for the LG config editors (v1 form + v2 inspector).

export interface ParamDef {
  key: string
  label: string
  help: string
  type: "number" | "boolean"
  min?: number
  max?: number
  step?: number
  autoable?: boolean
}

export const SHAPE_OPTIONS = [
  { value: "circle",   label: "Circle" },
  { value: "square",   label: "Square" },
  { value: "triangle", label: "Triangle" },
  { value: "rect",     label: "Rectangle" },
  { value: "oval",     label: "Oval" },
  { value: "custom",   label: "Custom (silhouette image)" },
]

export const COVER_OPTIONS = [
  { value: "bottom", label: "Bottom cover (pillar)" },
  { value: "top",    label: "Top cover (recess)" },
]

// Same underlying keys as the LED Pillar section — relabeled for top-cover
// mode where they define the puck recess instead of the pillar.
export const RECESS_PARAMS: ParamDef[] = [
  { key: "pillar_outer_r",    label: "Recess radius (mm)", help: "Radius of the LED puck recess under the top cover", type: "number", min: 1, max: 30, step: 0.5 },
  { key: "led_socket_height", label: "Recess depth (mm)",  help: "Depth of the recess; capped so the roof stays closed", type: "number", min: 0, max: 50, step: 0.5 },
]

export const SECTIONS: { title: string; params: ParamDef[] }[] = [
  {
    title: "Size / Geometry",
    params: [
      { key: "outer_radius",    label: "Outer radius (mm)",    help: "Radius of the casing wall",                                  type: "number", min: 10,  max: 300,  step: 0.5 },
      { key: "base_radius",     label: "Base radius (mm)",     help: "Radius of the floor plate (ignored for non-circle)",          type: "number", min: 10,  max: 300,  step: 0.5 },
      { key: "shell_height",    label: "Shell height (mm)",    help: "Total height of the stencil wall",                            type: "number", min: 5,   max: 200,  step: 0.5, autoable: true },
      { key: "shell_thickness", label: "Wall thickness (mm)",  help: "Thickness of the perforated wall",                            type: "number", min: 0.5, max: 10,   step: 0.1 },
      { key: "base_thickness",  label: "Base thickness (mm)",  help: "Thickness of the raised floor plate",                         type: "number", min: 0.5, max: 10,   step: 0.1 },
      { key: "casing_lift",     label: "Casing lift (mm)",     help: "Float casing above z=0 for external electronics chamber",     type: "number", min: 0,   max: 100,  step: 0.5 },
    ],
  },
  {
    title: "Shadow / Projection",
    params: [
      { key: "floor_half_size",  label: "Floor half-size (mm)", help: "Half-width of the shadow projection area",          type: "number", min: 50,   max: 2000, step: 5 },
      { key: "shadow_offset_x",  label: "Shadow X offset (mm)", help: "Shift shadow on floor without distortion",          type: "number", min: -500, max: 500,  step: 1 },
      { key: "shadow_offset_y",  label: "Shadow Y offset (mm)", help: "Shift shadow on floor without distortion",          type: "number", min: -500, max: 500,  step: 1 },
      { key: "auto_fit_mask",    label: "Auto-fit silhouette",  help: "Pad & center the image so nothing falls outside the circular projection area", type: "boolean" },
      { key: "mask_padding_pct", label: "Mask padding (%)",     help: "Extra white/transparent margin around the silhouette — shrinks the shadow; use if edges get clipped", type: "number", min: 0, max: 100, step: 1 },
    ],
  },
  {
    title: "Light Position",
    params: [
      { key: "light_x",        label: "Light X (mm)",        help: "Moves the light physically — causes distortion", type: "number", min: -50, max: 50, step: 0.5 },
      { key: "light_y",        label: "Light Y (mm)",        help: "Moves the light physically — causes distortion", type: "number", min: -50, max: 50, step: 0.5 },
      { key: "light_z_offset", label: "Light Z offset (mm)", help: "Height above wall top",                          type: "number", min: 0,   max: 50, step: 0.5 },
    ],
  },
  {
    title: "Smoothness",
    params: [
      { key: "edge_smooth_sigma", label: "Smooth sigma (px)", help: "Higher = smoother silhouette edges",     type: "number", min: 0,   max: 30, step: 0.5 },
      { key: "shadow_threshold",  label: "SDF threshold",     help: "+ erodes silhouette, - dilates it",     type: "number", min: -20, max: 20, step: 0.5 },
    ],
  },
  {
    title: "Resolution",
    params: [
      { key: "n_stencil_theta", label: "n_theta (angular)", help: "Angular segments. 2048 recommended", type: "number", min: 64,  max: 8192, step: 64 },
      { key: "n_stencil_z",     label: "n_z (vertical)",    help: "Vertical layers. 64 is sweet spot",  type: "number", min: 8,   max: 1024, step: 8 },
    ],
  },
  {
    title: "LED Pillar",
    params: [
      { key: "pillar_outer_r",   label: "Pillar outer radius (mm)", help: "Outer radius of LED holder tube",  type: "number",  min: 1,   max: 30, step: 0.5 },
      { key: "pillar_inner_r",   label: "Pillar inner radius (mm)", help: "Cable channel radius",              type: "number",  min: 0.5, max: 20, step: 0.5 },
      { key: "led_socket_height",label: "LED socket height (mm)",   help: "Height of LED mount above pillar top", type: "number", min: 0, max: 50, step: 0.5 },
      { key: "skip_led_pillar",  label: "Skip LED pillar",          help: "Omit the pillar entirely",          type: "boolean" },
    ],
  },
  {
    title: "Printability",
    params: [
      { key: "support_stems",  label: "Support stems",            help: "Bridge floating islands to base",                      type: "boolean" },
      { key: "stem_width",     label: "Stem width (columns)",     help: "2 ~ 1mm at r=40mm",                                   type: "number", min: 1, max: 10, step: 1 },
      { key: "min_bridge_mm",  label: "Min bridge width (mm)",    help: "Dilate thin features for printability. 0 = off",       type: "number", min: 0, max: 10, step: 0.1 },
    ],
  },
  {
    title: "Mesh Post-processing",
    params: [
      { key: "decimate_ratio", label: "Decimation ratio", help: "0 = off. 0.7 = remove 70% of faces", type: "number", min: 0, max: 0.95, step: 0.05 },
    ],
  },
  {
    title: "Image Adjustment",
    params: [
      { key: "img_brightness", label: "Brightness",       help: "-100..100 — applied before thresholding", type: "number", min: -100, max: 100, step: 1 },
      { key: "img_contrast",   label: "Contrast",         help: "-100..100 — applied before thresholding", type: "number", min: -100, max: 100, step: 1 },
      { key: "img_saturation", label: "Saturation (%)",   help: "0 = grayscale; tunes colored inputs",      type: "number", min: 0,    max: 200, step: 1 },
    ],
  },
]
