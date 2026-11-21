import { useId, useState } from 'react'
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

// sufijo: algo que va adentro del control, a la derecha (por ejemplo, el «ojito» de la clave).
// ayuda: un texto, o una lista (como los requisitos de la clave).
export function Campo({ etiqueta, ayuda, error, id, sufijo, as: Control = 'input', className = '', children, ...resto }) {
  const auto = useId()
  const campoId = id ?? auto
  const ayudaId = `${campoId}-ayuda`
  const errorId = `${campoId}-error`
  const describe = [ayuda && ayudaId, error && errorId].filter(Boolean).join(' ') || undefined
  const Ayuda = typeof ayuda === 'string' ? 'p' : 'div'

  const control = (
    <Control
      id={campoId}
      className="campo__control"
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describe}
      {...resto}
    >
      {children}
    </Control>
  )

  return (
    <div className={`campo ${className}`.trim()}>
      <label className="campo__label" htmlFor={campoId}>{etiqueta}</label>
      {sufijo ? <div className="campo__envoltura">{control}{sufijo}</div> : control}
      {ayuda && <Ayuda id={ayudaId} className="campo__ayuda">{ayuda}</Ayuda>}
      {error && <p id={errorId} className="campo__error" aria-live="polite">{error}</p>}
    </div>
  )
}

// Clave con el «ojito» para mostrarla u ocultarla. Con "requisitos" ([{ texto, ok }]) muestra
// debajo la lista de lo que tiene que cumplir y la va tildando mientras se escribe.
export function CampoClave({ requisitos, ayuda, className = '', ...resto }) {
  const [ver, setVer] = useState(false)
  const ojo = (
    <button
      type="button"
      className="campo-clave__ojo"
      onClick={() => setVer(!ver)}
      aria-label={ver ? 'Ocultar la clave' : 'Mostrar la clave'}
      aria-pressed={ver}
    >
      <Icono nombre={ver ? 'ojo-tachado' : 'ojo'} />
    </button>
  )
  const lista = requisitos && (
    <ul className="requisitos">
      {requisitos.map((r) => (
        <li key={r.texto} className={r.ok ? 'is-ok' : undefined}>
          <Icono nombre={r.ok ? 'tilde' : 'circulo'} tamano={16} />
          {r.texto}<span className="sr-only">{r.ok ? ': cumplido' : ': falta'}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <Campo
      {...resto}
      type={ver ? 'text' : 'password'}
      sufijo={ojo}
      ayuda={lista || ayuda}
      className={`campo-clave ${className}`.trim()}
      autoCapitalize="none"
      spellCheck={false}
    />
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
