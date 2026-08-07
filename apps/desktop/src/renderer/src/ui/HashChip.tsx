import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { IconButton } from "./Button";
import "./HashChip.css";

function shorten(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/**
 * Disclosure progressivo pra IDs/hashes técnicos (Etapa 31I): resumido por
 * padrão, com ação de copiar e um botão pra revelar o valor completo -
 * nenhum hash fica escondido, mas nenhum domina a interface por padrão.
 */
export function HashChip({ label, value }: { label?: string; value: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <span className="sp-hash-chip">
      {label && <span className="sp-hash-chip__label">{label}</span>}
      <button
        type="button"
        className="sp-hash-chip__value"
        onClick={(event) => {
          event.stopPropagation();
          setExpanded((current) => !current);
        }}
        title={expanded ? "Recolher" : "Ver completo"}
      >
        {expanded ? value : shorten(value)}
      </button>
      <IconButton
        label={copied ? "Copiado" : "Copiar"}
        size="sm"
        icon={copied ? <Check size={12} /> : <Copy size={12} />}
        onClick={(event) => {
          event.stopPropagation();
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      />
    </span>
  );
}
