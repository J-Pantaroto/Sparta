export interface AccentPalette {
  /** Cor de destaque principal (bordas ativas, rotulos de secao, botoes). */
  accent: string;
  /** Variante escura, pra bordas discretas e estados de repouso. */
  soft: string;
  /** Variante translucida, pra brilhos/sombras e o fundo ambiente do app. */
  glow: string;
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

/** Amostra pequena o suficiente pra ser instantanea e grande o suficiente pra representar a arte. */
const SAMPLE_SIZE = 48;

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
      glow: `hsl(${hueDegrees} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}% / 0.32)`
    };
  } catch {
    return undefined;
  }
}
