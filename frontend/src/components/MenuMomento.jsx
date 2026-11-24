import { MOMENTOS, cambiarQuieto, elegirModo, useFondo } from '../lib/fondo'

// Menú horizontal oscuro para elegir el fondo: Automático | Mañana · Tarde · Atardecer · Noche | Quieto.
// Se usa en el login (botón redondo arriba a la izquierda) y en el menú lateral ("Fondo").

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
const ICONOS = {
  auto: <svg viewBox="0 0 24 24" {...trazo}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  manana: <svg viewBox="0 0 24 24" {...trazo}><path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4" /></svg>,
  tarde: <svg viewBox="0 0 24 24" {...trazo}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  atardecer: <svg viewBox="0 0 24 24" {...trazo}><path d="M17 18a5 5 0 0 0-10 0M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4" /></svg>,
  noche: <svg viewBox="0 0 24 24" {...trazo}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>,
  quieto: <svg viewBox="0 0 24 24" {...trazo}><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></svg>,
}

export function IconoMomento({ nombre }) {
  return ICONOS[nombre] ?? null
}

// Flechas ← → para recorrer las opciones.
function conFlechas(e) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
  e.preventDefault()
  const botones = [...e.currentTarget.querySelectorAll('button')]
  const i = botones.indexOf(document.activeElement)
  const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
  botones[(i + paso + botones.length) % botones.length]?.focus()
}

export default function MenuMomento({ id, abierto, alElegir, className = '', style }) {
  const { modo, quieto } = useFondo()
  const tab = abierto ? 0 : -1
  const elegir = (m) => { elegirModo(m); alElegir?.() }
  return (
    <div id={id} className={`menu-momento ${className}`.trim()} data-abierto={abierto || undefined} style={style}
      role="menu" aria-label="Fondo" onKeyDown={conFlechas}>
      <button type="button" role="menuitemradio" aria-checked={modo === 'auto'} title="Automático (según la hora)" tabIndex={tab} onClick={() => elegir('auto')}>
        {ICONOS.auto}<span>Automático</span>
      </button>
      <hr />
      {MOMENTOS.map((m) => (
        <button key={m.id} type="button" role="menuitemradio" aria-checked={modo === m.id} title={m.texto} tabIndex={tab} onClick={() => elegir(m.id)}>
          {ICONOS[m.id]}<span>{m.texto}</span>
        </button>
      ))}
      <hr />
      <button type="button" role="menuitemcheckbox" aria-checked={quieto} title="Fondo quieto (sin animación)" tabIndex={tab} onClick={() => { cambiarQuieto(); alElegir?.() }}>
        {ICONOS.quieto}<span>Quieto</span>
      </button>
    </div>
  )
}
