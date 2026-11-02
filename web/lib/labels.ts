import type { ActorT, CategoryT } from './schema';

export const CATEGORY_LABEL: Record<CategoryT, string> = {
  dava: 'Dava',
  regulasyon: 'Düzenleme',
  taksici_odasi: 'Taksici odaları',
  sirket: 'Şirket',
  surucu_yolcu: 'Sürücü ve yolcu',
  saha: 'Sahadan',
  ekonomi: 'Ekonomi',
  diger: 'Diğer',
};

export const ACTOR_LABEL: Record<ActorT, string> = {
  marti: 'Martı',
  taksici_odasi: 'Taksici odaları',
  ibb_ukome: 'İBB / UKOME',
  bakanlik: 'Bakanlık',
  mahkeme: 'Mahkemeler',
  surucu: 'Sürücüler',
  yolcu: 'Yolcular',
  diger: 'Diğer',
};

/**
 * Categorical slots in fixed, validated order (dataviz reference palette).
 * Color follows the category, never its rank. Light = on paper, dark = on ink.
 */
export const CATEGORY_COLOR: Record<CategoryT, { light: string; dark: string }> = {
  dava: { light: '#2a78d6', dark: '#3987e5' },
  regulasyon: { light: '#eb6834', dark: '#d95926' },
  taksici_odasi: { light: '#1baf7a', dark: '#199e70' },
  sirket: { light: '#eda100', dark: '#c98500' },
  surucu_yolcu: { light: '#e87ba4', dark: '#d55181' },
  saha: { light: '#008300', dark: '#008300' },
  ekonomi: { light: '#6250d6', dark: '#9085e9' },
  diger: { light: '#e34948', dark: '#e66767' },
};
