import { ChampionSkinPicker } from "./ChampionSkinPicker";

interface SettingsScreenProps {
  ddragonVersion: string;
}

/**
 * Configuracoes pessoais do app. Nesta sub-fase (6a) so o tema visual
 * (campeao+skin) mora aqui; a configuracao de "partidas a analisar" (6b)
 * entra numa secao separada depois.
 */
export function SettingsScreen({ ddragonVersion }: SettingsScreenProps) {
  return (
    <>
      <header className="page-header compact">
        <span>Configurações</span>
        <h1>Preferências pessoais</h1>
      </header>
      <ChampionSkinPicker ddragonVersion={ddragonVersion} />
    </>
  );
}
