export interface HSL { h: number; s: number; l: number; }

export interface Swatch {
  id:  string;
  hex: string;
  name: string;
}

export interface Palette {
  id:      string;
  name:    string;
  swatches: Swatch[];
}

export type HarmonyType = 'complementary' | 'triadic' | 'analogous' | 'split-complementary' | 'tetradic';

export const HARMONY_LABELS: Record<HarmonyType, string> = {
  complementary:       'Complementary',
  triadic:             'Triadic',
  analogous:           'Analogous',
  'split-complementary': 'Split-Comp',
  tetradic:            'Tetradic',
};
