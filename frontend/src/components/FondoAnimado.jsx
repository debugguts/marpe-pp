import { useEffect, useRef, useState } from 'react'
import MenuMomento, { IconoMomento } from './MenuMomento'
import { MOMENTOS, actualizarHora, useFondo } from '../lib/fondo'
import '../styles/fondo-animado.css'

// Fondo del login con vida, sobre el mismo paisaje de todo el sistema (/fondo-paisaje.jpg):
//  · zoom muy lento, nubes, bruma, aves, luz del sol que respira y profundidad al mover el mouse;
//  · cambia según la hora del negocio: mañana clara, tarde soleada, atardecer y noche con luna y estrellas.
// Todo es CSS en el navegador de quien entra: el servidor solo manda la imagen una vez.
// Va detrás de todo el sistema (App.jsx). "conSelector" muestra el botón del fondo y "parallax" la profundidad
// con el mouse (los dos solo en el login; adentro el fondo se elige desde el menú lateral, "Fondo").
// "enSistema" corre la luna para que no quede detrás de los títulos. Lo elegido (momento y "quieto") está en lib/fondo.js.

// Estrellas y luces: se sortean una sola vez al cargar el archivo.
const ESTRELLAS = Array.from({ length: 70 }, () => ({
  left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
  opacity: 0.4 + Math.random() * 0.6, animationDelay: `${-Math.random() * 3}s`, scale: 0.6 + Math.random(),
}))
const LUCES = Array.from({ length: 16 }, () => ({
  left: `${Math.random() * 100}%`, top: `${45 + Math.random() * 50}%`,
  animationDuration: `${7 + Math.random() * 8}s`, animationDelay: `${-Math.random() * 12}s`,
}))

function Aves({ clase, ancho, alto, caja, alas }) {
  return (
    <svg className={`fondo__aves ${clase}`} width={ancho} height={alto} viewBox={caja}>
      <g className="fondo__ave">
        {alas.map(([d, demora]) => <path key={d} d={d} style={{ animationDelay: `${demora}s` }} />)}
      </g>
    </svg>
  )
}

export default function FondoAnimado({ conSelector = true, parallax = true, enSistema = false }) {
  const { modo, quieto, momento } = useFondo()
  const [menu, setMenu] = useState(false)
  const raiz = useRef(null)
  const selector = useRef(null)

  // Revisa la hora cada minuto (en automático cambia solo, con una transición suave).
  useEffect(() => {
    const id = setInterval(actualizarHora, 60_000)
    return () => clearInterval(id)
  }, [])

  // El momento queda en <html> para que también lo use el saludo del login.
  useEffect(() => {
    document.documentElement.dataset.momento = momento
    return () => { delete document.documentElement.dataset.momento }
  }, [momento])

  // Profundidad: cada capa se corre distinto al mover el mouse (solo con mouse y sin "reducir movimiento").
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    el.style.setProperty('--mx', 0)
    el.style.setProperty('--my', 0)
    if (!parallax || matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(pointer: fine)').matches) return
    let cuadro = 0
    const mover = (e) => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(() => {
        el.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3))
        el.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3))
      })
    }
    window.addEventListener('pointermove', mover)
    return () => { window.removeEventListener('pointermove', mover); cancelAnimationFrame(cuadro) }
  }, [parallax])

  // Con la pestaña escondida, las animaciones se pausan (no gastan batería ni procesador).
  useEffect(() => {
    const el = raiz.current
    const alCambiar = () => { if (el) el.dataset.pausa = document.hidden ? 'si' : 'no' }
    document.addEventListener('visibilitychange', alCambiar)
    return () => document.removeEventListener('visibilitychange', alCambiar)
  }, [])

  // El menú se cierra al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!menu) return
    const afuera = (e) => { if (!selector.current?.contains(e.target)) setMenu(false) }
    const tecla = (e) => { if (e.key === 'Escape') { setMenu(false); selector.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', afuera); document.removeEventListener('keydown', tecla) }
  }, [menu])

  const nombre = MOMENTOS.find((m) => m.id === momento)?.texto.toLowerCase()

  return (
    <>
      <div ref={raiz} className={`fondo${quieto ? ' fondo--quieto' : ''}${enSistema ? ' fondo--sistema' : ''}`} aria-hidden="true">
        <div className="fondo__capa" style={{ '--d': 10 }}><img className="fondo__img" src="/fondo-paisaje.jpg" alt="" /></div>
        <div className="fondo__capa" style={{ '--d': 12 }}>
          <div className="fondo__tinte" />
          <div className="fondo__estrellas">
            {ESTRELLAS.map(({ scale, ...s }, i) => <i key={i} style={{ ...s, transform: `scale(${scale})` }} />)}
          </div>
        </div>
        <div className="fondo__capa" style={{ '--d': 18 }}><div className="fondo__sol" /><div className="fondo__luna" /></div>
        <div className="fondo__capa" style={{ '--d': 26 }}>
          <div className="fondo__nube fondo__nube--1" /><div className="fondo__nube fondo__nube--2" /><div className="fondo__nube fondo__nube--3" />
        </div>
        <div className="fondo__capa" style={{ '--d': 34 }}>
          <div className="fondo__bruma" /><div className="fondo__bruma fondo__bruma--2" />
          <Aves clase="fondo__aves--1" ancho={180} alto={78} caja="0 0 120 52"
            alas={[['M10 22 q8 -9 16 0 q8 -9 16 0', 0], ['M60 8 q6 -7 12 0 q6 -7 12 0', -0.2], ['M50 36 q5 -6 10 0 q5 -6 10 0', -0.35], ['M88 26 q4 -5 8 0 q4 -5 8 0', -0.12]]} />
          <Aves clase="fondo__aves--2" ancho={120} alto={60} caja="0 0 80 40"
            alas={[['M6 18 q7 -8 14 0 q7 -8 14 0', -0.1], ['M42 26 q5 -6 10 0 q5 -6 10 0', -0.3]]} />
          <Aves clase="fondo__aves--3" ancho={96} alto={42} caja="0 0 80 35"
            alas={[['M8 16 q6 -7 12 0 q6 -7 12 0', -0.25], ['M44 22 q5 -6 10 0 q5 -6 10 0', -0.05]]} />
          {LUCES.map((s, i) => <span key={i} className="fondo__luz" style={s} />)}
        </div>
        <div className="fondo__vineta" />
      </div>

      {conSelector && (
        <div className={`momento${menu ? ' is-abierto' : ''}`} ref={selector}>
          <button type="button" className={`momento__boton${modo === 'auto' ? ' is-auto' : ''}`}
            aria-haspopup="menu" aria-expanded={menu} aria-controls="momento-menu"
            aria-label={`Fondo: ${nombre}${modo === 'auto' ? ' (automático)' : ''}${quieto ? ', quieto' : ''}. Cambiar fondo`}
            onClick={() => setMenu(!menu)}>
            <IconoMomento nombre={momento} />
            <span className="momento__punto" aria-hidden="true" />
          </button>
          <MenuMomento id="momento-menu" abierto={menu} alElegir={() => setMenu(false)} />
        </div>
      )}
    </>
  )
}
