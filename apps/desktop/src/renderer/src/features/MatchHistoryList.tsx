import type { ProfileRecentMatch } from "@sparta/core";
import { useEffect, useState } from "react";
import { QUEUE_FILTER_OPTIONS, ROLES, roleLabels } from "../app/labels";
import {
  fetchMatchHistory,
  type MatchHistoryFilters as ApiMatchHistoryFilters
} from "../services/api-client";
import type { DataDragonChampionSummary } from "../services/datadragon";
import { Button, EmptyState, ErrorState, Field, RecentMatchRow, SegmentedControl, Select, SkeletonRows } from "../ui";
import { groupMatchesByPeriod } from "./match-history-grouping";
import "./MatchHistoryList.css";

type ResultFilter = "ALL" | "WIN" | "LOSS";
type PeriodFilter = "ALL" | "7" | "14" | "30";

const PAGE_SIZE = 20;

interface MatchHistoryListProps {
  sessionToken: string;
  puuid: string;
  ddragonVersion: string;
  catalog?: DataDragonChampionSummary[];
  selectedMatchId: string | null;
  onSelect: (match: ProfileRecentMatch) => void;
}

function toApiFilters(
  role: string,
  result: ResultFilter,
  period: PeriodFilter,
  queueId: string,
  championId: string,
  offset: number
): ApiMatchHistoryFilters {
  return {
    ...(role ? { role: role as ApiMatchHistoryFilters["role"] } : {}),
    ...(result === "WIN" ? { won: true } : result === "LOSS" ? { won: false } : {}),
    ...(period !== "ALL" ? { periodDays: Number(period) as 7 | 14 | 30 } : {}),
    ...(queueId ? { queueId: Number(queueId) } : {}),
    ...(championId ? { championId: Number(championId) } : {}),
    limit: PAGE_SIZE,
    offset
  };
}

/**
 * Histórico pessoal filtrável, paginado por "carregar mais" e agrupado por
 * período (Etapa 31H). Substitui a lista fixa das últimas 10 partidas que o
 * pós-game usava - os filtros só cobrem o que a API sabe responder de
 * verdade (`/players/:puuid/match-history`), sem inventar nenhum novo.
 */
export function MatchHistoryList({
  sessionToken,
  puuid,
  ddragonVersion,
  catalog,
  selectedMatchId,
  onSelect
}: MatchHistoryListProps) {
  const [role, setRole] = useState("");
  const [result, setResult] = useState<ResultFilter>("ALL");
  const [period, setPeriod] = useState<PeriodFilter>("ALL");
  const [queueId, setQueueId] = useState("");
  const [championId, setChampionId] = useState("");

  const [matches, setMatches] = useState<ProfileRecentMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "loading-more" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    fetchMatchHistory(sessionToken, puuid, toApiFilters(role, result, period, queueId, championId, 0))
      .then((page) => {
        if (cancelled) return;
        setMatches(page.matches);
        setTotal(page.total);
        setStatus("success");
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error ? fetchError.message : "Não foi possível carregar o histórico."
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken, puuid, role, result, period, queueId, championId]);

  async function loadMore() {
    setStatus("loading-more");
    try {
      const page = await fetchMatchHistory(
        sessionToken,
        puuid,
        toApiFilters(role, result, period, queueId, championId, matches.length)
      );
      setMatches((current) => [...current, ...page.matches]);
      setTotal(page.total);
      setStatus("success");
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Não foi possível carregar mais partidas."
      );
      setStatus("error");
    }
  }

  const groups = groupMatchesByPeriod(matches);
  const hasMore = matches.length < total;

  return (
    <div className="sp-match-history">
      <div className="sp-match-history__filters">
        <Field label="Posição">
          <SegmentedControl
            ariaLabel="Filtrar por posição"
            value={role}
            onChange={setRole}
            options={[{ value: "", label: "Todas" }, ...ROLES.map((r) => ({ value: r, label: roleLabels[r] }))]}
          />
        </Field>
        <Field label="Resultado">
          <SegmentedControl<ResultFilter>
            ariaLabel="Filtrar por resultado"
            value={result}
            onChange={setResult}
            options={[
              { value: "ALL", label: "Todas" },
              { value: "WIN", label: "Vitórias" },
              { value: "LOSS", label: "Derrotas" }
            ]}
          />
        </Field>
        <Field label="Período">
          <SegmentedControl<PeriodFilter>
            ariaLabel="Filtrar por período"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "ALL", label: "Sempre" },
              { value: "7", label: "7 dias" },
              { value: "14", label: "14 dias" },
              { value: "30", label: "30 dias" }
            ]}
          />
        </Field>
        <Field label="Fila">
          <Select
            value={queueId}
            onChange={setQueueId}
            ariaLabel="Filtrar por fila"
            options={[
              { value: "", label: "Todas" },
              ...QUEUE_FILTER_OPTIONS.map((option) => ({
                value: String(option.value),
                label: option.label
              }))
            ]}
          />
        </Field>
        {catalog && catalog.length > 0 && (
          <Field label="Campeão">
            <Select
              value={championId}
              onChange={setChampionId}
              ariaLabel="Filtrar por campeão"
              options={[
                { value: "", label: "Todos" },
                ...[...catalog]
                  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                  .map((champion) => ({ value: String(champion.id), label: champion.name }))
              ]}
            />
          </Field>
        )}
      </div>

      {status === "loading" && <SkeletonRows count={5} height={72} />}

      {status === "error" && matches.length === 0 && (
        <ErrorState inline description={error ?? undefined} />
      )}

      {status !== "loading" && matches.length === 0 && status !== "error" && (
        <EmptyState
          title="Nenhuma partida encontrada"
          description="Nenhuma partida sincronizada corresponde aos filtros escolhidos."
        />
      )}

      {matches.length > 0 && (
        <div className="sp-match-history__groups">
          {groups.map((group) => (
            <div className="sp-match-history__group" key={group.key}>
              <h3 className="sp-match-history__group-label">{group.label}</h3>
              <div className="sp-match-history__rows">
                {group.matches.map((match) => (
                  <div
                    key={match.matchId}
                    className={
                      match.matchId === selectedMatchId ? "sp-match-history__row--selected" : undefined
                    }
                  >
                    <RecentMatchRow
                      match={match}
                      ddragonVersion={ddragonVersion}
                      onOpen={() => onSelect(match)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {matches.length > 0 && (
        <div className="sp-match-history__footer">
          <span className="sp-match-history__count">
            {matches.length} de {total} partida{total === 1 ? "" : "s"}
          </span>
          {hasMore && (
            <Button variant="secondary" onClick={() => void loadMore()} disabled={status === "loading-more"}>
              {status === "loading-more" ? "Carregando..." : "Carregar mais"}
            </Button>
          )}
        </div>
      )}
      {status === "error" && matches.length > 0 && (
        <ErrorState inline description={error ?? undefined} />
      )}
    </div>
  );
}
