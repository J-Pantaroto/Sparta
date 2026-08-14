// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  allowedRiotAuthorizationUrl,
  allowedSkinDownload,
  isExpectedRendererUrl,
  isTrustedIpcSender,
  isValidSessionToken,
  windowOpenPolicy
} from "./security-policy";

describe("fronteira de navegação do Electron", () => {
  it("aceita somente origin e pathname esperados no dev", () => {
    const expected = "http://localhost:5173/";
    expect(isExpectedRendererUrl("http://localhost:5173/", expected)).toBe(true);
    expect(isExpectedRendererUrl("http://localhost:5173/?vite=1", expected)).toBe(true);
    expect(isExpectedRendererUrl("http://localhost:5173.evil.example/", expected)).toBe(false);
    expect(isExpectedRendererUrl("http://localhost:5173/outro", expected)).toBe(false);
  });

  it("aceita somente o arquivo empacotado exato", () => {
    const expected = "file:///C:/Sparta/out/renderer/index.html";
    expect(isExpectedRendererUrl(expected, expected)).toBe(true);
    expect(isExpectedRendererUrl("file:///C:/Windows/System32/calc.exe", expected)).toBe(false);
  });

  it("nega window.open inesperado", () => {
    expect(windowOpenPolicy()).toEqual({ action: "deny" });
  });
});

describe("origem e payload dos IPCs privilegiados", () => {
  const expected = "http://localhost:5173/";
  const mainFrame = { url: expected };

  it("aceita o main frame da origem válida", () => {
    expect(isTrustedIpcSender({ senderFrame: mainFrame, sender: { mainFrame } }, expected)).toBe(
      true
    );
  });

  it("rejeita origem inválida e subframe não confiável", () => {
    const evilFrame = { url: "https://evil.example/" };
    expect(
      isTrustedIpcSender({ senderFrame: evilFrame, sender: { mainFrame: evilFrame } }, expected)
    ).toBe(false);
    expect(
      isTrustedIpcSender({ senderFrame: { url: expected }, sender: { mainFrame } }, expected)
    ).toBe(false);
  });

  it("rejeita payloads inválidos antes da operação privilegiada", () => {
    expect(isValidSessionToken(123)).toBe(false);
    expect(isValidSessionToken("")).toBe(false);
    expect(isValidSessionToken("x".repeat(8_193))).toBe(false);
    expect(allowedRiotAuthorizationUrl("https://evil.example/callback")).toBeNull();
    expect(allowedSkinDownload("https://ddragon.leagueoflegends.com/a.jpg", "../a.jpg")).toBeNull();
  });

  it("mantém allowlists estritas para Riot e skins", () => {
    expect(allowedRiotAuthorizationUrl("https://auth.riotgames.com/authorize")?.hostname).toBe(
      "auth.riotgames.com"
    );
    expect(
      allowedSkinDownload("https://ddragon.leagueoflegends.com/a.jpg", "Ahri_0.jpg")?.safeName
    ).toBe("Ahri_0.jpg");
  });
});
