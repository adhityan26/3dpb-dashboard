/**
 * Generates a map2model.com project JSON from a customer order config.
 * The GPX GeoJSON is left empty — the operator imports the Strava activity
 * directly in map2model after loading this file.
 */

export type MapSize = 'small' | 'medium' | 'large'
export type MapShape = 'square' | 'rectangle' | 'circle' | 'hexagon'

export interface LayerColors {
  gpxPath: string
  road: string
  water: string
  green: string
  building: string
}

export type LayerName = 'road' | 'water' | 'green' | 'building'

export interface Map2ModelConfig {
  size: MapSize
  shape: MapShape
  colors: LayerColors
  enabledLayers?: LayerName[]
  gpxGeoJson?: Record<string, unknown>
  areaPolygon?: Record<string, unknown>
  frameText?: string
}

const SIZE_MM: Record<MapSize, number> = {
  small: 100,
  medium: 150,
  large: 200,
}

const EMPTY_GPX_GEOJSON = {
  type: 'FeatureCollection',
  features: [] as unknown[],
  properties: { name: '', description: '', time: '' },
}

export function generateMap2ModelProject(config: Map2ModelConfig): Record<string, unknown> {
  const mapWidthMM = SIZE_MM[config.size]
  const enabled = new Set(config.enabledLayers ?? ['road', 'water', 'green', 'building'])

  return {
    generatorOptions: {
      mapWidthMM,
      baseLayerMM: 1,
      elevationEnabled: true,
      elevationLayersEnabled: false,
      elevationLayers: [],
      topographyOnly: false,
      elevationDataSource: 'mapterhorn',
      terrariumZoom: 15,
      elevationExaggeration: 1,
      elevationMedianFilterRadius: 1,
      flattenSea: false,

      // Roads
      roadHeightMM: 0.6,
      roadStartAtZero: false,
      roadWidthMultiplier: 1,
      roadDepthMM: 0,
      undergroundRoadsEnabled: false,
      footpathRoadsEnabled: true,
      customRoadWidths: {
        default: 5, motorway: 25, motorway_link: 12, trunk: 21, trunk_link: 10,
        primary: 15, primary_link: 8, secondary: 11, secondary_link: 6,
        tertiary: 9, tertiary_link: 5, unclassified: 7, residential: 6,
        service: 4, living_street: 4, pedestrian: 3, footway: 3, path: 3, cycleway: 3,
      },
      customRoadColors: {},
      customRoadEnabled: {
        default: true, motorway: true, motorway_link: true, trunk: true, trunk_link: true,
        primary: true, primary_link: true, secondary: true, secondary_link: true,
        tertiary: true, tertiary_link: true, unclassified: true, residential: true,
        service: true, living_street: true, pedestrian: true, footway: true, path: true, cycleway: true,
      },

      // Aeroways
      customAerowayWidths: { default: 10, runway: 60, taxiway: 10, apron: 20, helipad: 15 },
      customAerowayColors: {},
      customAerowayEnabled: { default: true, runway: true, taxiway: true, apron: true, helipad: true },

      // Railways
      customRailwayWidths: { default: 4, rail: 4, light_rail: 3, subway: 4, tram: 3, monorail: 3, funicular: 4, roller_coaster: 3 },
      customRailwayColors: {},
      customRailwayEnabled: { default: true, rail: true, light_rail: true, subway: true, tram: true, monorail: true, funicular: true, roller_coaster: true },

      // Ski runs
      customSkiRunWidths: { default: 10, downhill: 18, nordic: 5, sled: 7, skitour: 4, hike: 3 },
      customSkiRunColors: {},
      customSkiRunEnabled: { default: true, downhill: true, nordic: true, sled: true, skitour: true, hike: true },

      // Water
      waterHeightMM: 0.4,
      waterBaseEnabled: false,
      waterBaseHeightMM: 0.2,
      waterCutout: false,
      waterDepthMM: 0.8,
      minWaterAreaM2: 10,
      oceanEnabled: true,
      beachEnabled: true,
      beachHeightMM: 0.2,
      piersEnabled: true,
      pierHeightMM: 0.8,
      customWaterwayWidths: { default: 6, river: 20, stream: 4, canal: 8, drain: 2, ditch: 2 },
      customWaterwayEnabled: { default: true, river: true, stream: true, canal: true, drain: true, ditch: true },

      // Greenery
      greeneryHeightMM: 0.4,
      customGreeneryColors: {},
      greeneryTypeEnabled: {
        'landuse:grass': true, 'landuse:meadow': true, 'landuse:recreation_ground': true,
        'landuse:farmland': false, 'landuse:orchard': true, 'landuse:vineyard': true,
        'landuse:forest': true, 'landcover:grass': true, 'landcover:forest': true,
        'landcover:shrub': false, 'landcover:crop': false,
        'golf:fairway': false, 'golf:green': false, 'golf:rough': false, 'golf:tee': false, 'golf:bunker': false,
      },

      // Buildings
      dataSource: 'overture',
      roofsEnabled: true,
      buildingScaleFactor: 1,
      minBuildingHeightMM: 0.6,
      minBuildingAreaM2: 1,
      forceBasicShape: false,

      // Layers
      roadEnabled: enabled.has('road'),
      waterEnabled: enabled.has('water'),
      greeneryEnabled: enabled.has('green'),
      buildingsEnabled: enabled.has('building'),

      // GPX path
      gpxPathEnabled: true,
      gpxPathHeightMM: 1,
      gpxPathWidthMeters: 10,
      gpxPathNoAmsEnabled: false,
      gpxPathNoAmsToleranceMM: 0.2,
      gpxPathGeoJSON: config.gpxGeoJson ?? EMPTY_GPX_GEOJSON,

      customLines: [],
      customBuildings: [],
      landmarks: [],

      // ── Customer colors ──────────────────────────
      gpxPathColor: config.colors.gpxPath,
      roadColor: config.colors.road,
      waterColor: config.colors.water,
      greeneryColor: config.colors.green,
      buildingColor: config.colors.building,

      // Fixed defaults
      sandColor: '#fac393',
      pierColor: '#262626',
      baseColor: '#ffffff',
      frameColor: '#ffffff',

      // Frame
      frameEnabled: true,
      frameRounded: true,
      frameHeightMM: 1.4,
      frameThicknessMM: 3,
      frameBottomExtendMM: 0,
      frameTopExtendMM: 0,
      frameTextEnabled: Boolean(config.frameText),
      frameText: config.frameText ?? '',
      frameTopTextEnabled: false,
      frameTopText: '',
      frameTextFont: 'helvetiker',
      frameTextBold: true,
      frameTextColor: '#000000',
      frameSubtitleText: '',
      frameTopSubtitleText: '',
      frameSubtitleSizeMM: 4,
      frameTextSizeMM: 6,
      frameTextHeightMM: 0.8,
      frameTextVerticalPaddingMM: 2.7,

      // Export
      cropMapToBounds: true,
      exportGridCols: 1,
      exportGridRows: 1,
    },
    areaPolygon: config.areaPolygon ?? null,
    buildingOverrides: {},
  }
}
