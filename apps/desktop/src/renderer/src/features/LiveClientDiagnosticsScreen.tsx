import { useEffect, useState } from "react";
import { Activity, Radio } from "lucide-react";
import type { LiveClientStatePayload } from "../sparta-global";
import { Badge, Card, EmptyState, PageHero, PageLayout, SectionHeader } from "../ui";
import "./LiveClientDiagnosticsScreen.css";

/** Rótulos dos estados do ciclo de vida - texto, não só cor. */
const STATE_LABELS: Record<LiveClientStatePayload["state"], string> = {
  UNAVAILABLE: "Indisponível",
  CONNECTING: "Conectando",
  LIVE: "Ao vivo",
  DEGRADED: "Degradado",
  ENDED: "Encerrada"
};

const STATE_TONES: Record<LiveClientStatePayload["state"], "neutral" | "positive" | "warning"> = {
  UNAVAILABLE: "neutral",
  CONNECTING: "warning",
  LIVE: "positive",
  DEGRADED: "warning",
  ENDED: "neutral"
};

/** `undefined` vira travessão - nunca 0. A ausência precisa ficar visível. */
function show(value: number | undefined, decimals = 0): string {
  return value === undefined ? "—" : value.toFixed(decimals);
}

function gameClock(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Diagnóstico da fundação Live Client Data. Tela de DESENVOLVIMENTO, não de
 * produto: existe pra provar que a observação local funciona (o Game Client
 * é detectado, a sessão tem ciclo de vida, os eventos não repetem), não pra
 * o jogador consultar durante a partida.
 *
 * Não é overlay, não fala nada, não recomenda nada e não mostra dado de
 * adversário. Tudo aqui é observação factual do próprio jogador, já
 * normalizada e redigida (sem Riot ID) pelo processo main.
 */
export function LiveClientDiagnosticsScreen() {
  const [live, setLive] = useState<LiveClientStatePayload | null>(null);

  useEffect(() => {
    let active = true;
    void window.sparta.getLiveClientState().then((state) => {
      if (active) setLive(state);
    });
    const unsubscribe = window.sparta.onLiveClient((state) => setLive(state));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const snapshot = live?.snapshot ?? null;
  const scores = snapshot?.activePlayer.scores;

  return (
    <PageLayout>
      <PageHero
        eyebrow="Protótipo local"
        title="Observação ao vivo"
        subtitle="Fundação read-only da Game Client API local. Diagnóstico de desenvolvimento — não é uma funcionalidade do produto."
      />

      {live && !live.enabled && (
        <Card>
          <EmptyState
            icon={<Radio size={22} />}
            title="Protótipo desligado"
            description="A observação ao vivo é um protótipo local e permanece desabilitada por padrão. Para exercitá-la em desenvolvimento, inicie o app com SPARTA_LIVE_CLIENT_PROTOTYPE=1."
          />
        </Card>
      )}

      {live?.enabled && (
        <>
          <Card>
            <SectionHeader
              eyebrow="Estado"
              title="Sessão de observação"
              description="O Game Client só responde durante uma partida. Fora dela, indisponível é o estado normal — não um erro."
              actions={<Badge tone={STATE_TONES[live.state]}>{STATE_LABELS[live.state]}</Badge>}
            />
            <dl className="sp-live-diag">
              <div>
                <dt>Sessão</dt>
                <dd>{live.sessionId || "—"}</dd>
              </div>
              <div>
                <dt>Tempo de jogo</dt>
                <dd>{gameClock(snapshot?.game.gameTimeSeconds)}</dd>
              </div>
              <div>
                <dt>Modo</dt>
                <dd>{snapshot?.game.mode ?? "—"}</dd>
              </div>
              <div>
                <dt>Mapa</dt>
                <dd>{snapshot?.game.mapName ?? "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <SectionHeader
              eyebrow="Jogador ativo"
              title="Observação do próprio jogador"
              description="Somente o jogador desta instalação. Nenhum dado de adversário é consumido nem exibido."
            />
            <dl className="sp-live-diag">
              <div>
                <dt>Nível</dt>
                <dd>{show(snapshot?.activePlayer.level)}</dd>
              </div>
              <div>
                <dt>Ouro</dt>
                <dd>{show(snapshot?.activePlayer.currentGold)}</dd>
              </div>
              <div>
                <dt>K / D / A</dt>
                <dd>
                  {scores
                    ? `${show(scores.kills)} / ${show(scores.deaths)} / ${show(scores.assists)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>CS</dt>
                <dd>{show(scores?.creepScore)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <SectionHeader
              eyebrow="Eventos"
              title="Eventos factuais observados"
              description="Somente o que a API devolveu, sem interpretação e sem inferência. Cada evento aparece uma única vez por sessão."
            />
            {live.recentEvents.length === 0 ? (
              <EmptyState
                inline
                icon={<Activity size={22} />}
                title="Nenhum evento observado"
                description="Eventos aparecem conforme a partida os produz."
              />
            ) : (
              <ul className="sp-live-events">
                {live.recentEvents.map((event) => (
                  <li key={event.id}>
                    <span className="sp-live-events__time">
                      {gameClock(event.gameTimeSeconds)}
                    </span>
                    <strong>{event.name}</strong>
                    <span className="sp-live-events__id">#{event.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </PageLayout>
  );
}
