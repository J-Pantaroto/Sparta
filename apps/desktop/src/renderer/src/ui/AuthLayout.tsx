import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { BRAND_MARK_URL } from "./brand-mark";
import { SpartaIdentityBackdrop } from "./SpartaIdentity";
import "./AuthLayout.css";

interface AuthLayoutProps {
  /** `null` quando nenhum campeão/skin foi escolhido - cai pra identidade Sparta. */
  splashUrl: string | null;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  progressStep?: 1 | 2 | 3 | 4;
}

/**
 * Casca unica do acesso: conta, confirmacao de email e vinculo Riot. Antes
 * do onboarding pedir uma conta Riot, nao ha "campeao do jogador" nenhum -
 * por isso o fundo cai pra identidade Sparta sempre que `splashUrl` e nulo,
 * em vez do antigo default fixo em Ahri (Ahri e conteudo do League, nao a
 * marca do produto).
 */
export function AuthLayout({
  splashUrl,
  title,
  subtitle,
  children,
  footer,
  progressStep
}: AuthLayoutProps) {
  const titleRef = useRef<globalThis.HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), [title]);
  return (
    <div
      className="sp-auth"
      style={splashUrl ? { backgroundImage: `url(${splashUrl})` } : undefined}
    >
      {!splashUrl && <SpartaIdentityBackdrop />}
      <main className="sp-auth__card">
        <div className="sp-auth__brand">
          <div className="sp-auth__mark" aria-hidden="true">
            <img src={BRAND_MARK_URL} alt="" />
          </div>
          <div>
            <strong className="sp-auth__wordmark">Sparta</strong>
            <span className="sp-auth__tagline">Draft &amp; performance</span>
          </div>
        </div>

        {progressStep && <OnboardingProgress currentStep={progressStep} />}
        <h1 ref={titleRef} tabIndex={-1} className="sp-auth__title">
          {title}
        </h1>
        {subtitle && <p className="sp-auth__subtitle">{subtitle}</p>}
        {children}
        {footer && <p className="sp-auth__footer">{footer}</p>}
      </main>
    </div>
  );
}

function OnboardingProgress({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }) {
  const labels = ["Conta", "Email", "Riot", "Pronto"];
  return (
    <ol className="sp-onboarding-progress" aria-label="Progresso do acesso">
      {labels.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3 | 4;
        return (
          <li
            key={label}
            className={`sp-onboarding-progress__step${step <= currentStep ? " sp-onboarding-progress__step--active" : ""}`}
            aria-current={step === currentStep ? "step" : undefined}
          >
            <span className="sp-onboarding-progress__number">{step}</span>
            <span className="sp-onboarding-progress__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function AuthForm({
  children,
  onSubmit
}: {
  children: ReactNode;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="sp-auth__form" onSubmit={onSubmit}>
      {children}
    </form>
  );
}
