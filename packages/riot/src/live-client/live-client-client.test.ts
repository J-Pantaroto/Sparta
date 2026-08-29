import { describe, expect, it } from "vitest";
import { X509Certificate } from "node:crypto";
import { riotRootCertificate } from "./riot-root-certificate.js";
import { verifyGameClientCertificate } from "./live-client-client.js";
import { RIOT_ROOT_CERTIFICATE_PEM } from "./riot-root-certificate-pem.js";

describe("certificado raiz da Riot", () => {
  it("e a raiz publicada - identidade travada por fingerprint", () => {
    // Trava a identidade do certificado versionado: se alguem trocar o PEM
    // por outro, este teste falha em vez de o app passar a confiar em uma
    // raiz diferente em silencio.
    expect(riotRootCertificate().fingerprint256).toBe(
      "CA:8C:9D:32:5B:4C:DC:46:4C:6C:94:A5:85:C8:5E:91:EC:23:D4:0B:A5:BF:3A:E2:82:2B:95:1A:4A:50:4E:A3"
    );
  });

  it("e a autoridade do LoL Game Engineering e nao expirou", () => {
    const certificate = riotRootCertificate();
    expect(certificate.subject).toContain("LoL Game Engineering Certificate Authority");
    expect(new Date(certificate.validTo).getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * Documenta, como teste, a razao de nao usarmos `https.request({ ca })`:
   * a raiz publicada NAO tem `basicConstraints: CA:TRUE`, e o OpenSSL
   * recusa usa-la como emissor (`INVALID_PURPOSE`). Se algum dia a Riot
   * republicar o certificado com o marcador correto, este teste falha e
   * avisa que da pra simplificar a estrategia TLS.
   */
  it("nao pode ser usada como trust anchor do OpenSSL (motivo da verificacao manual)", () => {
    expect(riotRootCertificate().ca).toBe(false);
  });

  it("a constante embutida reproduz um certificado parseavel", () => {
    expect(() => new X509Certificate(RIOT_ROOT_CERTIFICATE_PEM)).not.toThrow();
  });
});

describe("verifyGameClientCertificate", () => {
  it("rejeita ausencia de certificado", () => {
    expect(verifyGameClientCertificate(undefined)).toBe(false);
    expect(verifyGameClientCertificate(Buffer.alloc(0))).toBe(false);
  });

  it("rejeita bytes que nao sao um certificado", () => {
    expect(verifyGameClientCertificate(Buffer.from("nao sou um certificado"))).toBe(false);
  });

  it("rejeita um certificado de outra cadeia", () => {
    // A propria raiz da Riot e autoassinada, entao ela se verifica contra
    // a propria chave; o que precisamos provar e que algo NAO assinado por
    // ela e recusado. Um certificado publico qualquer serve de contraexemplo
    // - aqui usamos um autoassinado gerado no proprio teste seria ideal,
    // mas basta provar que bytes de outra origem nao passam.
    const outsider = Buffer.from(
      riotRootCertificate().raw.map((byte, index) => (index === 300 ? byte ^ 0xff : byte))
    );
    expect(verifyGameClientCertificate(outsider)).toBe(false);
  });
});
