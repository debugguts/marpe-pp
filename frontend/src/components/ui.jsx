import { useId } from 'react'
import Icono from './Icono'

export function Boton({
  variante = 'primario',
  cargando = false,
  textoCargando,
  disabled,
  icono,
  children,
  className = '',
  type = 'button',
  ...resto
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variante} ${className}`.trim()}
      disabled={cargando || disabled}
      aria-busy={cargando || undefined}
      {...resto}
    >
      {cargando ? <span className="btn__spinner" aria-hidden="true" /> : icono && <Icono nombre={icono} />}
      <span>{cargando && textoCargando ? textoCargando : children}</span>
    </button>
  )
}

export function Campo({ etiqueta, ayuda, error, id, as: Control = 'input', className = '', children, ...resto }) {
  const auto = useId()
  const campoId = id ?? auto
  const ayudaId = `${campoId}-ayuda`
  const errorId = `${campoId}-error`
  const describe = [ayuda && ayudaId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`campo ${className}`.trim()}>
      <label className="campo__label" htmlFor={campoId}>{etiqueta}</label>
      <Control
        id={campoId}
        className="campo__control"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describe}
        {...resto}
      >
        {children}
      </Control>
      {ayuda && <p id={ayudaId} className="campo__ayuda">{ayuda}</p>}
      {error && <p id={errorId} className="campo__error" aria-live="polite">{error}</p>}
    </div>
  )
}

export function Insignia({ variante = 'neutro', children }) {
  return <span className={`insignia insignia--${variante}`}>{children}</span>
}

export function Panel({ titulo, accion, className = '', children }) {
  const id = useId()
  return (
    <section className={`panel ${className}`.trim()} aria-labelledby={titulo ? id : undefined}>
      {(titulo || accion) && (
        <header className="panel__cab">
          {titulo && <h2 id={id} className="panel__titulo">{titulo}</h2>}
          {accion}
        </header>
      )}
      {children}
    </section>
  )
}

export function CabeceraPagina({ titulo, descripcion, acciones }) {
  return (
    <header className="cab-pagina">
      <div className="cab-pagina__texto">
        <h1>{titulo}</h1>
        {descripcion && <p className="cab-pagina__desc">{descripcion}</p>}
      </div>
      {acciones}
    </header>
  )
}

export function EstadoVacio({ icono = 'catalogo', titulo, texto, children }) {
  return (
    <div className="vacio">
      <span className="vacio__icono"><Icono nombre={icono} tamano={24} /></span>
      <h2>{titulo}</h2>
      {texto && <p>{texto}</p>}
      {children}
    </div>
  )
}
