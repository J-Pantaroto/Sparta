import { Globe, Lock, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, Card, SectionHeader } from "../ui";
import "./AboutSection.css";

/**
 * Os dois avisos legais da Riot Games são exigências DISTINTAS que não se
 * substituem (ver `docs/riot-policy-compliance-matrix.md`, Etapa 31L): a
 * política de conteúdo de fã ("Legal Jibber Jabber") e a política de
 * desenvolvedor específica de League of Legends. O texto em inglês é
 * reproduzido sem paráfrase, igual ao publicado pela Riot e ao já registrado
 * em `apps/site/termos.html` (seção 11) - as duas cópias precisam
 * permanecer idênticas.
 *
 * Ficam como constantes literais (não vêm de rede) porque esta tela precisa
 * funcionar offline - o Sparta lê partidas via API própria, mas o aviso
 * legal não pode depender dela estar no ar.
 */
const RIOT_FAN_CONTENT_DISCLAIMER_EN =
  'Sparta GG was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.';
const RIOT_FAN_CONTENT_DISCLAIMER_PT =
  'O Sparta GG foi criado sob a política "Legal Jibber Jabber" da Riot Games, usando recursos de propriedade da Riot Games. A Riot Games não endossa nem patrocina este projeto.';

const RIOT_DEVELOPER_API_DISCLAIMER_EN =
  "Sparta GG is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";
const RIOT_DEVELOPER_API_DISCLAIMER_PT =
  "O Sparta GG não é endossado pela Riot Games e não reflete as opiniões ou pontos de vista da Riot Games ou de qualquer pessoa oficialmente envolvida na produção ou gestão de propriedades da Riot Games. A Riot Games e todas as propriedades associadas são marcas comerciais ou marcas registradas da Riot Games, Inc.";

interface PlannedLinkProps {
  icon: ReactNode;
  label: string;
}

/**
 * Enquanto spartagg.com.br não está publicado, nenhum link daqui pode
 * parecer funcional nem apontar pra localhost/GitHub como substituto (Etapa
 * 31L.1, seção 5) - por isso é um botão desabilitado de verdade
 * (`disabled`), não uma âncora morta.
 */
function PlannedLink({ icon, label }: PlannedLinkProps) {
  return (
    <Button variant="secondary" size="sm" icon={icon} disabled>
      {label}
      <Badge tone="neutral" size="sm">
        Em preparação
      </Badge>
    </Button>
  );
}

export function AboutSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <Card>
        <SectionHeader
          title="Sparta GG"
          description="Análise pessoal e apoio à tomada de decisão no League of Legends, a partir do seu próprio histórico de partidas."
          actions={<Badge tone="accent">v{window.sparta.version}</Badge>}
        />
        <p className="sp-about__text">
          O Sparta GG é um projeto independente. Ele não substitui, automatiza nem interfere no
          cliente do League of Legends - lê dados através da Riot Games API e, quando o cliente
          está aberto, observa a sessão local sem nunca modificá-la.
        </p>
      </Card>

      <Card>
        <SectionHeader
          title="Links públicos"
          description="Ficam ativos assim que o site institucional for publicado. Até lá, nenhum destes aponta para um endereço real."
        />
        <div className="sp-about__links">
          <PlannedLink icon={<Globe size={14} />} label="Site institucional" />
          <PlannedLink icon={<Lock size={14} />} label="Política de Privacidade" />
          <PlannedLink icon={<ScrollText size={14} />} label="Termos de Uso" />
        </div>
      </Card>

      <Card>
        <SectionHeader
          title="Avisos legais da Riot Games"
          description="Duas políticas distintas da Riot Games se aplicam ao Sparta GG e nenhuma substitui a outra. Os dois textos abaixo são reproduzidos na íntegra, sem paráfrase."
        />

        <div className="sp-about__disclaimer">
          <span className="sp-about__disclaimer-label">
            Política de conteúdo de fã (&quot;Legal Jibber Jabber&quot;)
          </span>
          <blockquote className="sp-about__disclaimer-quote">{RIOT_FAN_CONTENT_DISCLAIMER_EN}</blockquote>
          <p className="sp-about__disclaimer-translation">Em português: {RIOT_FAN_CONTENT_DISCLAIMER_PT}</p>
        </div>

        <div className="sp-about__disclaimer">
          <span className="sp-about__disclaimer-label">Política de desenvolvedor — League of Legends</span>
          <blockquote className="sp-about__disclaimer-quote">{RIOT_DEVELOPER_API_DISCLAIMER_EN}</blockquote>
          <p className="sp-about__disclaimer-translation">Em português: {RIOT_DEVELOPER_API_DISCLAIMER_PT}</p>
        </div>

        <p className="sp-about__text sp-about__text--muted">
          League of Legends e Riot Games são marcas registradas da Riot Games, Inc. O Sparta GG
          não usa o logotipo da Riot Games nem o do League of Legends como identidade própria, e
          nenhum elemento de design sugere se tratar de produto oficial, aprovado ou parceiro da
          Riot Games.
        </p>
      </Card>
    </div>
  );
}
