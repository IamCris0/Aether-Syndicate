/**
 * Operadores — sistema 100% cosmético (NUNCA cambian estadísticas).
 * Cada operador define la paleta del rig (acento emisivo + armadura) y su
 * ficha. Se desbloquean por el pase de batalla; dos son gratuitos de inicio.
 * El id equipado viaja en el join y se replica para que los demás te vean.
 */

export interface OperatorDef {
  id: string;
  name: string;
  corp: string;
  description: string;
  /** Color del visor/franjas emisivas. */
  accent: number;
  /** Color base de la armadura. */
  armor: number;
  /** Nivel del pase que lo desbloquea (null = gratuito). */
  bpTier: number | null;
}

export const OPERATORS: Record<string, OperatorDef> = {
  'op-cipher': {
    id: 'op-cipher',
    name: 'Cipher',
    corp: 'Sindicato Aether',
    description: 'Especialista en infiltración orbital. El operador estándar del Sindicato.',
    accent: 0x38e0c8,
    armor: 0x232d40,
    bpTier: null,
  },
  'op-vermell': {
    id: 'op-vermell',
    name: 'Vermell',
    corp: 'Corporación Karmine',
    description: 'Veterana de las guerras del cinturón. Roja como el metal fundido de Kessler.',
    accent: 0xff4d5e,
    armor: 0x2a161c,
    bpTier: null,
  },
  'op-aurum': {
    id: 'op-aurum',
    name: 'Aurum',
    corp: 'Consorcio Midas',
    description: 'Mercenario de élite. Su armadura dorada es una declaración de guerra.',
    accent: 0xffd24a,
    armor: 0x2e2a18,
    bpTier: 8,
  },
  'op-nova': {
    id: 'op-nova',
    name: 'Nova',
    corp: 'Colectivo Umbral',
    description: 'Nadie la ha visto dos veces con vida. Violeta como el vacío profundo.',
    accent: 0xa97fff,
    armor: 0x241538,
    bpTier: 33,
  },
  'op-tundra': {
    id: 'op-tundra',
    name: 'Tundra',
    corp: 'División Polar',
    description: 'Forjado en las lunas heladas de Etherium. Frío, metódico, letal.',
    accent: 0x7dffb2,
    armor: 0x8fa2b8,
    bpTier: 58,
  },
  'op-umbra': {
    id: 'op-umbra',
    name: 'Umbra',
    corp: 'Los Sin Bandera',
    description: 'El contrabandista que conoce cada conducto de cada estación.',
    accent: 0xff7733,
    armor: 0x171008,
    bpTier: 78,
  },
};

export const DEFAULT_OPERATOR_ID = 'op-cipher';

export const getOperator = (id: string | undefined | null): OperatorDef =>
  (id && OPERATORS[id]) || OPERATORS[DEFAULT_OPERATOR_ID];
