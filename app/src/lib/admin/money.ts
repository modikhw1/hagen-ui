export const sekToOre = (sek: number) => Math.round(sek * 100);

export const oreToSek = (ore: number) => ore / 100;

export const formatSek = (ore: number) =>
  `${Math.round(ore / 100).toLocaleString('sv-SE')} kr`;
