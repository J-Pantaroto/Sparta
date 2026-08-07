import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AccountOnboardingStatus } from "@sparta/core";
import type { SessionUser } from "../services/api-client";

vi.mock("../services/api-client", () => ({
  changeAccountEmail: vi.fn(),
  revokeRiotLink: vi.fn()
}));

import { AccountScreen } from "./AccountScreen";

const user: SessionUser = {
  id: "user-1",
  email: "manual-stats-7787eeb1-85fa-49d1-a4ab-88027d61c0e5@sparta.local",
  displayName: null,
  emailVerifiedAt: new Date().toISOString(),
  isActive: true
};

const onboarding: AccountOnboardingStatus = {
  state: "READY",
  requiredStep: null,
  accountActive: true,
  email: { masked: "ma***********@sparta.local", verified: true, verifiedAt: new Date().toISOString() },
  riot: {
    linked: true,
    linkStatus: "UNVERIFIED_LEGACY",
    acceptedForCurrentEnvironment: true,
    rsoEnabled: false,
    localControlledMode: true,
    localRiotLinkEnabled: false,
    riotId: "Zekerus#117"
  }
};

describe("AccountScreen", () => {
  it("campo 'Novo email' começa vazio, nunca pré-preenchido com o email atual (Etapa 31J)", () => {
    render(
      <AccountScreen
        token="token-1"
        user={user}
        onboarding={onboarding}
        onSessionRotated={vi.fn()}
        onOnboardingChanged={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    const input = screen.getByLabelText("Novo email") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.value).not.toContain(user.email);
  });
});
