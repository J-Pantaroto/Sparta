/**
 * Gerador minimo de certificados X.509 para TESTE.
 *
 * Existe porque a garantia de seguranca da Live Client Data API depende de
 * uma pergunta que so um certificado impostor real responde: "um certificado
 * autoassinado de OUTRA chave e recusado?". Sem gerar um de verdade, o teste
 * so conseguiria adulterar bytes do proprio certificado da Riot - o que prova
 * deteccao de adulteracao, nao rejeicao de outra cadeia.
 *
 * Nao ha biblioteca de emissao de certificado no projeto, e nao vale adicionar
 * uma so pra isto (mesma decisao do zip cru em `scripts/extract-zip-patch.test.ts`).
 * O DER e escrito a mao, com o minimo de ASN.1 necessario.
 *
 * Fica em `__fixtures__/` de proposito: o build do pacote e o empacotamento do
 * Electron excluem esse diretorio, entao este codigo nunca entra em produto.
 */
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

const encodeLength = (length: number): Buffer => {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};

const tlv = (tag: number, content: Buffer): Buffer =>
  Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);

const sequence = (...parts: Buffer[]): Buffer => tlv(0x30, Buffer.concat(parts));
const setOf = (...parts: Buffer[]): Buffer => tlv(0x31, Buffer.concat(parts));
const utf8String = (value: string): Buffer => tlv(0x0c, Buffer.from(value, "utf-8"));
const nullValue = Buffer.from([0x05, 0x00]);

const objectIdentifier = (dotted: string): Buffer => {
  const parts = dotted.split(".").map((part) => Number.parseInt(part, 10));
  const bytes: number[] = [40 * parts[0] + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk: number[] = [];
    let value = part;
    do {
      chunk.unshift(value & 0x7f);
      value >>>= 7;
    } while (value > 0);
    for (let index = 0; index < chunk.length - 1; index += 1) chunk[index] |= 0x80;
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
};

const integer = (value: number): Buffer => {
  const bytes: number[] = [];
  let remaining = value;
  do {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  } while (remaining > 0);
  if ((bytes[0] & 0x80) !== 0) bytes.unshift(0x00);
  return tlv(0x02, Buffer.from(bytes));
};

const bitString = (content: Buffer): Buffer =>
  tlv(0x03, Buffer.concat([Buffer.from([0x00]), content]));

const utcTime = (date: Date): Buffer => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const text =
    pad(date.getUTCFullYear() % 100) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z";
  return tlv(0x17, Buffer.from(text, "ascii"));
};

/** CN=<commonName>, o unico atributo de nome que estes testes precisam. */
const distinguishedName = (commonName: string): Buffer =>
  sequence(setOf(sequence(objectIdentifier("2.5.4.3"), utf8String(commonName))));

/** sha256WithRSAEncryption */
const signatureAlgorithm = sequence(objectIdentifier("1.2.840.113549.1.1.11"), nullValue);

const toPem = (der: Buffer, label: string): string => {
  const body = der.toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${body}${body.endsWith("\n") ? "" : "\n"}-----END ${label}-----\n`;
};

export interface SyntheticCertificate {
  commonName: string;
  certificateDer: Buffer;
  certificatePem: string;
  privateKeyPem: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

export interface SyntheticIssuer {
  commonName: string;
  privateKey: KeyObject;
}

/**
 * Emite um certificado X.509 v1 assinado por `issuer` (ou autoassinado, se
 * `issuer` for omitido). v1 basta: nada aqui valida cadeia pelo OpenSSL - o
 * ponto e exatamente que o Sparta confere a assinatura a mao.
 */
export function createSyntheticCertificate(
  commonName: string,
  issuer?: SyntheticIssuer
): SyntheticCertificate {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const issuerName = issuer?.commonName ?? commonName;
  const signingKey = issuer?.privateKey ?? privateKey;

  const notBefore = new Date(Date.now() - 60 * 60 * 1000);
  const notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const tbsCertificate = sequence(
    integer(Math.floor(Math.random() * 0x7fffffff) + 1),
    signatureAlgorithm,
    distinguishedName(issuerName),
    sequence(utcTime(notBefore), utcTime(notAfter)),
    distinguishedName(commonName),
    publicKey.export({ type: "spki", format: "der" })
  );

  const certificateDer = sequence(
    tbsCertificate,
    signatureAlgorithm,
    bitString(sign("sha256", tbsCertificate, signingKey))
  );

  return {
    commonName,
    certificateDer,
    certificatePem: toPem(certificateDer, "CERTIFICATE"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    privateKey,
    publicKey
  };
}
