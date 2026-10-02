import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIVE_GUIDANCE_PUBLIC_RELEASE,
  LIVE_VOICE_GUIDANCE_PUBLIC_RELEASE,
  LOCAL_AI_COACH_ENABLED,
  isLiveClientPrototypeEnabled,
  isLocalAiCoachPrototypeEnabled
} from "./live-guidance-gate";

describe("gate do protótipo de observação ao vivo", () => {
  it("release pública continua desabilitada", () => {
    // Trava o critério de aceitação: se alguém ligar isso sem passar pela
    // comunicação à Riot e pela revisão de política, o teste reprova.
    expect(LIVE_GUIDANCE_PUBLIC_RELEASE).toBe(false);
  });

  it("desligado por padrão, mesmo em desenvolvimento", () => {
    expect(isLiveClientPrototypeEnabled({})).toBe(false);
    expect(isLiveClientPrototypeEnabled({ NODE_ENV: "development" })).toBe(false);
  });

  it("liga somente com opt-in explícito fora de produção", () => {
    expect(
      isLiveClientPrototypeEnabled({ NODE_ENV: "development", SPARTA_LIVE_CLIENT_PROTOTYPE: "1" })
    ).toBe(true);
  });

  it("NUNCA liga em produção, nem com a variável ligada", () => {
    // A garantia central: um instalador de produção não satisfaz as duas
    // condições, então o protótipo não vaza pra uma release por descuido.
    expect(
      isLiveClientPrototypeEnabled({ NODE_ENV: "production", SPARTA_LIVE_CLIENT_PROTOTYPE: "1" })
    ).toBe(false);
  });

  it("valor diferente de '1' não liga", () => {
    expect(
      isLiveClientPrototypeEnabled({
        NODE_ENV: "development",
        SPARTA_LIVE_CLIENT_PROTOTYPE: "true"
      })
    ).toBe(false);
  });
});

describe("gate do coach local", () => {
  it("fica desligado por padrao e fora da release publica", () => {
    expect(LOCAL_AI_COACH_ENABLED).toBe(false);
    expect(LIVE_VOICE_GUIDANCE_PUBLIC_RELEASE).toBe(false);
    expect(isLocalAiCoachPrototypeEnabled({ NODE_ENV: "development" })).toBe(false);
  });

  it("exige os dois opt-ins e recusa producao", () => {
    expect(
      isLocalAiCoachPrototypeEnabled({ NODE_ENV: "development", SPARTA_LOCAL_AI_COACH: "1" })
    ).toBe(false);
    expect(
      isLocalAiCoachPrototypeEnabled({
        NODE_ENV: "development",
        SPARTA_LOCAL_AI_COACH: "1",
        SPARTA_LIVE_CLIENT_PROTOTYPE: "1"
      })
    ).toBe(true);
    expect(
      isLocalAiCoachPrototypeEnabled({
        NODE_ENV: "production",
        SPARTA_LOCAL_AI_COACH: "1",
        SPARTA_LIVE_CLIENT_PROTOTYPE: "1"
      })
    ).toBe(false);
  });
});

describe("superfície exposta ao renderer", () => {
  const preloadSource = readFileSync(join(__dirname, "..", "preload", "index.ts"), "utf-8");

  /**
   * Só o CÓDIGO, sem comentários. A distinção importa: o preload documenta
   * em prosa por que não existe `fetch(url)` genérico e cita a porta 2999
   * ao explicar a origem do dado. Verificar o arquivo cru reprovaria a
   * própria documentação; o que precisa estar limpo é o que executa.
   */
  const preloadCode = preloadSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("o preload não expõe fetch/request genérico", () => {
    // O renderer não pode ganhar um proxy HTTP pra localhost. Se alguém
    // adicionar um método assim, este teste reprova antes do review.
    expect(preloadCode).not.toMatch(/\bfetch\s*\(/);
    expect(preloadCode).not.toMatch(/\brequest\s*\(\s*url/);
  });

  it("o renderer não recebe host, porta nem path da Game Client API", () => {
    // Nenhum literal de endereço no código da ponte: quem monta a URL é o
    // main, e o renderer só nomeia canais IPC.
    expect(preloadCode).not.toContain("127.0.0.1");
    expect(preloadCode).not.toContain("2999");
    expect(preloadCode).not.toContain("liveclientdata");
  });

  it("os canais de observação ao vivo passam por invoke/on tipados", () => {
    expect(preloadCode).toContain("sparta:live-client-state");
    expect(preloadCode).toContain("sparta:live-client");
  });

  it("o coach nao recebe URL ou prompt arbitrario do renderer", () => {
    expect(preloadCode).toContain("sparta:local-coach:settings");
    expect(preloadCode).toContain("sparta:local-coach:test-voice");
    expect(preloadCode).not.toMatch(/localCoach\s*:\s*\{[\s\S]*?(url|prompt)\s*:/i);
  });
});
