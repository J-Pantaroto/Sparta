import { describe, expect, it } from "vitest";
import { classifyLcuNetworkFailure, parseLcuLockfile } from "./read-only-client.js";

describe("LCU read-only resilience", () => {
  it.each(["", "LeagueClient:1:not-a-port:secret:https", "LeagueClient:1:2999::https", "LeagueClient:1:2999:secret:http"])(
    "distingue lockfile invalido sem expor credencial (%s)",
    (raw) => {
      expect(parseLcuLockfile(raw)).toEqual({ status: "LOCKFILE_INVALID" });
    }
  );

  it("aceita somente o formato local https esperado", () => {
    expect(parseLcuLockfile("LeagueClient:123:2999:secret:https")).toEqual({
      status: "OK",
      data: { port: 2999, password: "secret", protocol: "https" }
    });
  });

  it("distingue timeout, conexao recusada e endpoint indisponivel", () => {
    expect(classifyLcuNetworkFailure(true, "ECONNREFUSED")).toBe("REQUEST_TIMEOUT");
    expect(classifyLcuNetworkFailure(false, "ECONNREFUSED")).toBe("CONNECTION_REFUSED");
    expect(classifyLcuNetworkFailure(false, "ECONNRESET")).toBe("ENDPOINT_UNAVAILABLE");
  });
});
