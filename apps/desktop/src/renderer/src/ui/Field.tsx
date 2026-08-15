import { Search, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { IconButton } from "./Button";
import "./Field.css";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  /** Liga o `<label>` ao controle. Omitido, o children deve trazer o seu. */
  htmlFor?: string;
}

/** Rotulo + controle + dica, com a associacao acessivel correta. */
export function Field({ label, hint, children, htmlFor }: FieldProps) {
  return (
    <div className="sp-field">
      <label className="sp-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="sp-field__hint">{hint}</span>}
    </div>
  );
}

/**
 * Valor exibido no lugar de um controle, quando o dado e detectado
 * automaticamente e nao ha o que editar (ex. posicao vinda do LCU). Borda
 * tracejada comunica "isto e leitura, nao entrada".
 */
export function ReadOnlyValue({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="sp-field__readonly">
      {icon}
      {children}
    </div>
  );
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Select<T extends string>({ value, onChange, options, id, disabled, ariaLabel }: SelectProps<T>) {
  return (
    <select
      id={id}
      className="sp-select"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  id?: string;
  ariaLabel?: string;
}

export function NumberField({ value, onChange, onCommit, min, max, id, ariaLabel }: NumberFieldProps) {
  return (
    <input
      id={id}
      type="number"
      className="sp-input"
      value={value}
      min={min}
      max={max}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value))}
      onBlur={(event) => onCommit?.(Number(event.target.value))}
    />
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/** Campo de busca com icone e botao de limpar (aparece so com conteudo). */
export function SearchInput({ value, onChange, placeholder = "Buscar...", ariaLabel }: SearchInputProps) {
  const id = useId();
  return (
    <div className="sp-search">
      <span className="sp-search__icon" aria-hidden="true">
        <Search size={16} />
      </span>
      <input
        id={id}
        type="search"
        className="sp-input"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <span className="sp-search__clear">
          <IconButton size="sm" label="Limpar busca" icon={<X size={14} />} onClick={() => onChange("")} />
        </span>
      )}
    </div>
  );
}

interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  type?: "text" | "email" | "password";
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  ariaLabel?: string;
}

/** Entrada de texto simples com o estilo do design system. */
export function TextField({ value, onChange, id, type = "text", ...rest }: TextFieldProps) {
  const { ariaLabel, ...inputProps } = rest;
  return (
    <input
      {...inputProps}
      id={id}
      type={type}
      className="sp-input"
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
