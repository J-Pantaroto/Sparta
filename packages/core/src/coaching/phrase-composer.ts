import type { CoachingDecision, CoachingVerbosity, PersonalCoachingContext } from "./contracts.js";

const OBSERVATION: Record<CoachingDecision["observation"], string> = {
  VISION_WINDOW: "Há uma possível janela de visão, se estiver segura.",
  EARLY_SAFETY_WINDOW: "O começo ainda permite priorizar uma margem segura.",
  LOW_SURVIVABILITY_MARGIN: "Sua margem de vida está reduzida.",
  FARM_WINDOW: "O farm pode ser o foco desta janela.",
  LOW_RESOURCE_MARGIN: "Seus recursos estão baixos."
};

const OPTION: Record<CoachingDecision["options"][number], string> = {
  ESTABLISH_VISION_WHEN_SAFE: "Uma opção é estabelecer visão quando houver segurança.",
  PLAY_WITH_SAFETY_MARGIN: "Uma opção é jogar com mais margem.",
  MAINTAIN_FARM: "Uma opção é manter o farm.",
  PRESERVE_RESOURCES: "Uma opção é preservar recursos.",
  REDUCE_PRESSURE: "Uma opção é reduzir a pressão agora."
};

export function composeCoachingPhrase(
  decision: CoachingDecision,
  personal: PersonalCoachingContext,
  verbosity: CoachingVerbosity
): string {
  const primary = `${OBSERVATION[decision.observation]} ${OPTION[decision.options[0]]}`;
  if (verbosity === "BRIEF") return primary;
  const signal =
    decision.category === "VISION"
      ? personal.vision
      : decision.category === "SURVIVABILITY"
        ? personal.survivability
        : decision.category === "FARM_RESOURCES"
          ? personal.farming
          : null;
  const personalNote =
    signal?.state === "RECURRING_CONCERN"
      ? ` Esse tema apareceu de forma recorrente em ${signal.sampleSize} partidas do seu histórico disponível.`
      : "";
  const alternative = decision.options[1]
    ? ` Alternativamente, ${OPTION[decision.options[1]].toLowerCase()}`
    : "";
  return `${primary}${alternative}${personalNote}`;
}
