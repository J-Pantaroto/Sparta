export interface AccentPalette {
  /** Preenchimento, borda ativa e marcador. NAO usar como texto. */
  accent: string;
  /** Variante escura, pra bordas discretas e estados de repouso. */
  soft: string;
  /** Variante translucida, pra brilhos/sombras e o fundo ambiente do app. */
  glow: string;
  /**
   * Unica variante do destaque aprovada para TEXTO sobre superficie escura.
   * A faixa travada abaixo garante que o accent seja visivel como
   * preenchimento, mas NAO que ele seja legivel como texto: medido sobre
   * `--surface-2`, um azul (240) em L=45% da 2.06:1 e mesmo no teto de 62%
   * fica em 4.13:1 - reprova AA. Por isso o texto ganha a propria variante,
   * clareada ate cruzar o limiar.
   */
  text: string;
  /**
   * Tinta a usar SOBRE o preenchimento do destaque (botao primario, skip
   * link, marca da sidebar). Preta ou branca, escolhida por medicao - nao
   * por regra fixa: com tinta escura sempre, o pior caso da faixa travada
   * cai a 2.04:1; escolhendo a melhor das duas por accent, o pior caso
   * sobe para 4.58:1 e passa AA.
   */
  onAccent: string;
}

/**
 * Faixa segura da cor de destaque. A splash art pode ser de qualquer cor -
 * inclusive marrom escuro, cinza lavado ou quase branco - e usar a cor crua
 * deixaria a UI sem contraste contra o fundo quase-preto do app. Saturar o
 * minimo e prender a luminosidade nessa faixa garante que qualquer skin
 * gere um destaque legivel.
 */
const MIN_SATURATION = 0.55;
const MIN_LIGHTNESS = 0.45;
const MAX_LIGHTNESS = 0.62;

/**
 * Contraste minimo exigido do destaque quando ele vira TEXTO (WCAG AA para
 * texto normal) e a luminancia relativa da superficie de referencia
 * (`--surface-2`, #0f0f13 - a mais clara sobre a qual esse texto aparece no
 * tema padrao; usar a mais clara e o caso pior, entao o resultado tambem
 * serve pras superficies mais escuras).
 */
const TEXT_CONTRAST_TARGET = 4.5;
const REFERENCE_SURFACE_LUMINANCE = 0.005182;
/** Teto: acima disso a cor perde a identidade da skin e vira quase branco. */
const MAX_TEXT_LIGHTNESS = 0.95;

/** Amostra pequena o suficiente pra ser instantanea e grande o suficiente pra representar a arte. */
const SAMPLE_SIZE = 48;

function hueToChannel(p: number, q: number, t: number): number {
  let position = t;
  if (position < 0) position += 1;
  if (position > 1) position -= 1;
  if (position < 1 / 6) return p + (q - p) * 6 * position;
  if (position < 1 / 2) return q;
  if (position < 2 / 3) return p + (q - p) * (2 / 3 - position) * 6;
  return p;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) return [lightness, lightness, lightness];
  const q =
    lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const h = hue / 360;
  return [hueToChannel(p, q, h + 1 / 3), hueToChannel(p, q, h), hueToChannel(p, q, h - 1 / 3)];
}

/** Luminancia relativa (WCAG 2.x) de um RGB normalizado 0-1. */
function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const channel = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastAgainstSurface(luminance: number): number {
  const lighter = Math.max(luminance, REFERENCE_SURFACE_LUMINANCE);
  const darker = Math.min(luminance, REFERENCE_SURFACE_LUMINANCE);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Tinta escura sobre preenchimento. Preto PURO, nao o quase-preto #08080a
 * usado no resto do app: medido, com #08080a o melhor caso possivel ainda
 * cai a 4.47:1 (accent h210 s95% l46%) e reprova AA; com preto puro o pior
 * caso da faixa inteira sobe para 4.58:1 e passa. A diferenca so importa
 * aqui, onde a tinta disputa contraste com um preenchimento saturado.
 */
const DARK_INK: [number, number, number] = [0, 0, 0];
const LIGHT_INK: [number, number, number] = [1, 1, 1];

function contrastBetween(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Escolhe a tinta legivel sobre o PREENCHIMENTO do destaque comparando as
 * duas opcoes, em vez de assumir que a escura sempre ganha - assuncao que a
 * medicao derrubou: num accent escuro (L=45%) a tinta escura da 2.04:1,
 * enquanto a branca da 6.13:1.
 */
export function readableInkOnAccent(
  hueDegrees: number,
  saturation: number,
  lightness: number
): string {
  const fill = hslToRgb(hueDegrees, saturation, lightness);
  return contrastBetween(DARK_INK, fill) >= contrastBetween(LIGHT_INK, fill)
    ? "#000000"
    : "#ffffff";
}

/**
 * Sobe a luminosidade da cor - preservando matiz e saturacao, ou seja, a
 * identidade da skin - ate ela cruzar o limiar de contraste como texto.
 * Devolve a propria entrada quando ela ja passa, e para no teto quando nem
 * o branco quase puro resolveria (nao existe cor dessa matiz que passe).
 */
export function readableAccentText(
  hueDegrees: number,
  saturation: number,
  lightness: number
): string {
  let candidate = lightness;
  while (
    candidate < MAX_TEXT_LIGHTNESS &&
    contrastAgainstSurface(relativeLuminance(hslToRgb(hueDegrees, saturation, candidate))) <
      TEXT_CONTRAST_TARGET
  ) {
    candidate += 0.01;
  }
  const finalLightness = Math.min(MAX_TEXT_LIGHTNESS, candidate);
  return `hsl(${hueDegrees} ${Math.round(saturation * 100)}% ${Math.round(finalLightness * 100)}%)`;
}

/** Pixels muito escuros/claros sao fundo ou brilho, nao a cor da skin. */
const MIN_PIXEL_LIGHTNESS = 0.15;
const MAX_PIXEL_LIGHTNESS = 0.85;
/** Abaixo disso o pixel e cinza - nao diz nada sobre a identidade da skin. */
const MIN_PIXEL_SATURATION = 0.2;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
  else if (max === green) hue = ((blue - red) / delta + 2) / 6;
  else hue = ((red - green) / delta + 4) / 6;
  return [hue, saturation, lightness];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Necessario pra poder ler os pixels depois - Data Dragon e Community
    // Dragon respondem `Access-Control-Allow-Origin: *`, entao o canvas nao
    // fica "tainted". Skins ja baixadas sao data URLs, que nem precisam.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("falha ao carregar a imagem"));
    image.src = url;
  });
}

/**
 * Deriva a paleta de destaque do app a partir da splash art da skin
 * escolhida, agrupando os pixels por matiz e escolhendo a matiz com mais
 * peso (frequencia x saturacao) - media simples de RGB daria sempre um
 * cinza-marrom, ja que cores opostas se cancelam.
 *
 * Retorna `undefined` em qualquer falha (CORS, imagem quebrada, arte sem
 * nenhuma cor saturada) - o chamador deve manter a cor padrao em vez de
 * aplicar uma cor inventada.
 */
export async function extractAccentPalette(imageUrl: string): Promise<AccentPalette | undefined> {
  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    // 24 baldes de matiz (15 graus cada) - granular o bastante pra separar
    // vermelho de laranja, grosso o bastante pra nao fragmentar um degrade.
    const buckets = new Array(24).fill(0).map(() => ({ weight: 0, saturation: 0, lightness: 0 }));
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 128) continue; // transparente
      const [hue, saturation, lightness] = rgbToHsl(data[index], data[index + 1], data[index + 2]);
      if (lightness < MIN_PIXEL_LIGHTNESS || lightness > MAX_PIXEL_LIGHTNESS) continue;
      if (saturation < MIN_PIXEL_SATURATION) continue;
      const bucket = buckets[Math.min(23, Math.floor(hue * 24))];
      // Pondera por saturacao: um pixel vibrante define a identidade da skin
      // mais do que um pixel quase-cinza que passou no corte por pouco.
      bucket.weight += saturation;
      bucket.saturation += saturation;
      bucket.lightness += lightness;
    }

    let best = -1;
    let bestWeight = 0;
    buckets.forEach((bucket, index) => {
      if (bucket.weight > bestWeight) {
        bestWeight = bucket.weight;
        best = index;
      }
    });
    if (best === -1) return undefined; // arte sem nenhuma cor utilizavel

    const bucket = buckets[best];
    const hueDegrees = Math.round((best + 0.5) * 15);
    const saturation = Math.max(MIN_SATURATION, bucket.saturation / bucket.weight);
    const rawLightness = bucket.lightness / bucket.weight;
    const lightness = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, rawLightness));

    return {
      accent: `hsl(${hueDegrees} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`,
      soft: `hsl(${hueDegrees} ${Math.round(saturation * 100)}% ${Math.round(lightness * 45)}%)`,
      glow: `hsl(${hueDegrees} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}% / 0.32)`,
      text: readableAccentText(hueDegrees, saturation, lightness),
      onAccent: readableInkOnAccent(hueDegrees, saturation, lightness)
    };
  } catch {
    return undefined;
  }
}
