import type { CSSProperties, ReactNode } from "react";
import "./DataTable.css";

interface DataTableProps {
  /** Template CSS de colunas, ex. "1.6fr 90px 90px 1fr". */
  columns: string;
  head?: ReactNode;
  children: ReactNode;
}

/** Lista tabular com colunas definidas por quem usa (nao fixas na classe). */
export function DataTable({ columns, head, children }: DataTableProps) {
  const style = { ["--sp-cols" as string]: columns } as CSSProperties;
  return (
    <div className="sp-table" style={style}>
      {head && <div className="sp-table__head">{head}</div>}
      {children}
    </div>
  );
}

interface DataRowProps {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  label?: string;
}

/**
 * Linha da tabela. Com `onClick` vira um `<button>` de verdade - a versao
 * antiga usava `<article style={{cursor:"pointer"}}>`, que nao recebia foco
 * nem respondia ao teclado.
 */
export function DataRow({ children, onClick, selected = false, label }: DataRowProps) {
  const className = [
    "sp-table__row",
    onClick ? "sp-table__row--clickable" : "",
    selected ? "sp-table__row--selected" : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (!onClick) return <div className={className}>{children}</div>;

  return (
    <button type="button" className={className} onClick={onClick} aria-current={selected} aria-label={label}>
      {children}
    </button>
  );
}

interface IdentityCellProps {
  avatar?: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}

/** Avatar + nome + linha de contexto - a celula mais repetida das listas. */
export function IdentityCell({ avatar, name, meta, trailing }: IdentityCellProps) {
  return (
    <div className="sp-identity">
      {avatar}
      <div className="sp-identity__text">
        <strong className="sp-identity__name">{name}</strong>
        {meta && <span className="sp-identity__meta">{meta}</span>}
      </div>
      {trailing}
    </div>
  );
}

export function NumCell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <span className={`sp-num${strong ? " sp-num--strong" : ""}`}>{children}</span>;
}
