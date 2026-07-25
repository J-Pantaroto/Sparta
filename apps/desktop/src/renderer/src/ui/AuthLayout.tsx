import type { FormEvent, ReactNode } from "react";
import "./AuthLayout.css";

interface AuthLayoutProps {
  /** Splash do tema atual - a identidade já aparece antes do login. */
  splashUrl: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Saída sem conta, discreta no rodapé (não trava o uso local). */
  skip?: ReactNode;
}

/** Casca das telas fora do shell: entrar, criar conta e vincular Riot. */
export function AuthLayout({ splashUrl, title, subtitle, children, footer, skip }: AuthLayoutProps) {
  return (
    <div className="sp-auth" style={{ backgroundImage: `url(${splashUrl})` }}>
      <div className="sp-auth__card">
        <div className="sp-auth__brand">
          <div className="sp-auth__mark" aria-hidden="true">
            S
          </div>
          <div>
            <strong className="sp-auth__wordmark">Sparta</strong>
            <span className="sp-auth__tagline">Draft &amp; performance</span>
          </div>
        </div>

        <h1 className="sp-auth__title">{title}</h1>
        {subtitle && <p className="sp-auth__subtitle">{subtitle}</p>}

        {children}

        {footer && <p className="sp-auth__footer">{footer}</p>}
        {skip && <div className="sp-auth__skip">{skip}</div>}
      </div>
    </div>
  );
}

/** Formulário do cartão de autenticação (só o espaçamento consistente). */
export function AuthForm({ children, onSubmit }: { children: ReactNode; onSubmit: (event: FormEvent) => void }) {
  return (
    <form className="sp-auth__form" onSubmit={onSubmit}>
      {children}
    </form>
  );
}
