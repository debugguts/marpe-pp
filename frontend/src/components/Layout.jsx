import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Logo from './Logo'
import Icono from './Icono'
import EditarPerfil from './EditarPerfil'
import MenuMomento, { IconoMomento } from './MenuMomento'
import { useFondo } from '../lib/fondo'
import { api } from '../lib/api'
import { moneda, ZONA } from '../lib/formato'
import { useLogout, useSesion } from '../lib/sesion'

// Diseño elegido por el cliente (Sprint 9):
//  · Arriba, una barra con el logo, las secciones del día a día en píldoras, la hora, buscar, avisos y el usuario.
//  · A la izquierda, un menú en grupos redondeados con cada ícono en una "redondela" (Sprint 11).
//    Se abre y se cierra con "Menú": abierto muestra los nombres; cerrado quedan solo las redondelas
//    y el nombre aparece al pasar el mouse. Se recuerda en este navegador.
//    Letra pedida por el cliente: de Menú a Clientes, Roboto; de Reportes a Salir, Inter.
//  · En el celular las píldoras pasan a una fila que se desliza y el menú se abre por encima.

// Operación: van en la barra de arriba, en el orden del día a día.
const OPERACION = [
  { a: '/', texto: 'Inicio', icono: 'inicio', fin: true },
  { a: '/ventas', texto: 'Ventas', icono: 'ventas' },
  { a: '/caja', texto: 'Caja', icono: 'caja' },
  { a: '/compras', texto: 'Compras', icono: 'compras', soloAdministrador: true },
  { a: '/inventario', texto: 'Inventario', icono: 'inventario' },
  { a: '/gastos', texto: 'Gastos', icono: 'gastos', soloAdministrador: true },
  { a: '/cuentas', texto: 'Cuentas', icono: 'cuentas' },
]

// Van en el menú lateral.
const GRUPOS = [
  {
    titulo: 'Maestros',
    letra: 'roboto',
    items: [
      { a: '/catalogo', texto: 'Catálogo', icono: 'catalogo' },
      { a: '/proveedores', texto: 'Proveedores', icono: 'proveedores' },
      { a: '/clientes', texto: 'Clientes', icono: 'clientes' },
    ],
  },
  {
    titulo: 'Administración',
    letra: 'inter',
    soloAdministrador: true, // el Operador no ve este grupo (S4-06)
    items: [
      { a: '/reportes', texto: 'Reportes', icono: 'reportes' },
      { a: '/usuarios', texto: 'Usuarios y roles', icono: 'usuarios' },
    ],
  },
]

const CELULAR = '(max-width: 56.25rem)'
const esCelular = () => window.matchMedia(CELULAR).matches

// Abierto o cerrado, recordado en el navegador (en el celular siempre arranca cerrado).
function menuInicial() {
  if (esCelular()) return false
  try { return localStorage.getItem('marpe-menu') !== 'cerrado' } catch { return true }
}

// true en el celular; se actualiza si cambia el ancho de la ventana.
function useCelular() {
  const [celular, setCelular] = useState(esCelular)
  useEffect(() => {
    const consulta = window.matchMedia(CELULAR)
    const alCambiar = () => setCelular(consulta.matches)
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])
  return celular
}

// Un renglón del menú: la redondela con el ícono y el nombre (que, cerrado, aparece al pasar el mouse).
function ItemMenu({ it, alElegir }) {
  return (
    <NavLink to={it.a} end={it.fin} onClick={alElegir} data-texto={it.texto}
      className={({ isActive }) => `nav-item${isActive ? ' is-activo' : ''}`}>
      <span className="redondela"><Icono nombre={it.icono} tamano={18} /></span>
      <span className="nav-item__texto">{it.texto}</span>
    </NavLink>
  )
}

export default function Layout() {
  const [abierto, setAbierto] = useState(menuInicial)
  const [perfil, setPerfil] = useState(false)
  const celular = useCelular()
  // Recién ingresado desde el login: la cabecera, el menú y el contenido entran de a poco (una sola vez).
  // Después se quita, para que cambiar de sección no repita la animación.
  const [entrada, setEntrada] = useState(() => sessionStorage.getItem('marpe-entrada') === '1')
  useEffect(() => {
    sessionStorage.removeItem('marpe-entrada')
    if (!entrada) return
    const id = setTimeout(() => setEntrada(false), 2500)
    return () => clearTimeout(id)
  }, [entrada])
  // Al cerrar sesión, "usuario" queda vacío un instante antes de que
  // RutaPrivada nos lleve al login: por eso se lee con "?." (sin romper).
  const { data: usuario } = useSesion()
  const salir = useLogout()
  const nombre = usuario?.nombre ?? ''
  const esAdministrador = usuario?.rol === 'Administrador'
  // El Operador no ve lo que no puede usar (grupos o ítems marcados soloAdministrador).
  const permitido = (x) => !x.soloAdministrador || esAdministrador
  const operacion = OPERACION.filter(permitido)
  const grupos = GRUPOS.filter(permitido).map((g) => ({ ...g, items: g.items.filter(permitido) }))

  const cambiarMenu = (valor) => {
    setAbierto(valor)
    if (!esCelular()) {
      try { localStorage.setItem('marpe-menu', valor ? 'abierto' : 'cerrado') } catch { /* sin almacenamiento: no pasa nada */ }
    }
  }

  // En el celular el menú tapa la pantalla: se cierra al elegir una sección y con Escape.
  const alElegir = () => { if (esCelular()) setAbierto(false) }
  useEffect(() => {
    if (!abierto) return
    const alTecla = (e) => { if (e.key === 'Escape' && esCelular()) setAbierto(false) }
    document.addEventListener('keydown', alTecla)
    return () => document.removeEventListener('keydown', alTecla)
  }, [abierto])

  return (
    <div className="app" data-menu={abierto ? 'abierto' : 'cerrado'} data-entrada={entrada || undefined}>
      <a className="saltar" href="#contenido">Saltar al contenido</a>

      <header className="cabecera">
        <NavLink to="/" className="cabecera__logo" aria-label="Huevería Marpe, ir al inicio"><Logo alto={58} /></NavLink>

        <nav className="pestanas" aria-label="Operación">
          {operacion.map((it) => (
            <NavLink key={it.a} to={it.a} end={it.fin}
              className={({ isActive }) => `pestana${isActive ? ' is-activa' : ''}`}>
              {it.texto}
            </NavLink>
          ))}
        </nav>

        <div className="cabecera__der">
          <Reloj />
          <Buscar secciones={[...operacion, ...grupos.flatMap((g) => g.items)]} />
          <Avisos />
          <span className="usuario-chip" title={usuario?.rol}>
            <span className="usuario-chip__nombre">{nombre.split(' ')[0]}</span>
            <span className="avatar" aria-hidden="true">{nombre.charAt(0).toUpperCase()}</span>
          </span>
        </div>
      </header>

      <div className="cuerpo">
        <aside id="lateral" className="lateral" inert={celular && !abierto}>
          <div className="lat-grupo letra-roboto">
            <button type="button" className="nav-item nav-item--menu" data-texto={abierto ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={abierto} aria-controls="lateral" onClick={() => cambiarMenu(!abierto)}>
              <span className="redondela"><Icono nombre={celular ? 'cerrar' : 'menu'} tamano={18} /></span>
              <span className="nav-item__texto">Menú</span>
            </button>
          </div>
          <nav className="lateral__nav" aria-label="Maestros y administración">
            {grupos.map((g) => (
              <div className={`lat-grupo letra-${g.letra}`} key={g.titulo}>
                <p className="nav-grupo__titulo">{g.titulo}</p>
                <ul className="nav-lista">
                  {g.items.map((it) => <li key={it.texto}><ItemMenu it={it} alElegir={alElegir} /></li>)}
                </ul>
              </div>
            ))}
            {/* En el celular las secciones de la barra también están acá */}
            <div className="lat-grupo letra-roboto nav-grupo--celular">
              <p className="nav-grupo__titulo">Operación</p>
              <ul className="nav-lista">
                {operacion.map((it) => <li key={it.a}><ItemMenu it={it} alElegir={alElegir} /></li>)}
              </ul>
            </div>
          </nav>
          <div className="lat-grupo letra-inter lateral__pie">
            <OpcionFondo />
            <button type="button" className="nav-item" data-texto="Editar perfil" onClick={() => { alElegir(); setPerfil(true) }}>
              <span className="redondela"><Icono nombre="lapiz" tamano={18} /></span>
              <span className="nav-item__texto">Editar perfil</span>
            </button>
            <button type="button" className="nav-item nav-item--salir" data-texto="Salir" onClick={() => salir.mutate()} disabled={salir.isPending}>
              <span className="redondela"><Icono nombre="salir" tamano={18} /></span>
              <span className="nav-item__texto">Salir</span>
            </button>
          </div>
        </aside>

        {abierto && (
          <button type="button" className="scrim" aria-label="Cerrar menú" tabIndex={-1} onClick={() => cambiarMenu(false)} />
        )}

        <main id="contenido" tabIndex={-1} className="contenido">
          {/* Solo en el celular: con el menú escondido, este botón lo abre */}
          {celular && !abierto && (
            <button type="button" className="boton-redondo boton-menu" aria-label="Abrir menú"
              aria-expanded="false" aria-controls="lateral" onClick={() => cambiarMenu(true)}>
              <Icono nombre="menu" tamano={22} />
            </button>
          )}
          <Outlet />
        </main>
      </div>
      {perfil && usuario && <EditarPerfil usuario={usuario} alCerrar={() => setPerfil(false)} />}
    </div>
  )
}

// Hora y fecha de hoy; se actualiza sola cada 15 segundos.
// Con la zona del negocio: si la PC está en otra zona, el reloj igual muestra la hora de Salta.
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA })
const DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: ZONA })
const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: ZONA })

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])
  const dia = DIA.format(ahora)
  return (
    <time className="reloj" dateTime={ahora.toISOString()}>
      <span className="reloj__icono"><Icono nombre="reloj" tamano={16} /></span>
      <span className="reloj__hora">{HORA.format(ahora)}<small>hs</small></span>
      <span className="reloj__fecha"><b>{dia.charAt(0).toUpperCase() + dia.slice(1)}</b>{FECHA.format(ahora).replace('.', '')}</span>
    </time>
  )
}

// Ventanita que se cierra al hacer clic afuera o con Escape.
function useVentanita() {
  const [abierta, setAbierta] = useState(false)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierta) return
    const afuera = (e) => { if (!caja.current?.contains(e.target)) setAbierta(false) }
    const tecla = (e) => { if (e.key === 'Escape') setAbierta(false) }
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', afuera); document.removeEventListener('keydown', tecla) }
  }, [abierta])
  return { abierta, setAbierta, caja }
}

// Buscar: escribís parte del nombre de una sección y vas directo (Enter abre la primera).
function Buscar({ secciones }) {
  const { abierta, setAbierta, caja } = useVentanita()
  const [texto, setTexto] = useState('')
  const navegar = useNavigate()
  const normal = (t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const encontradas = secciones.filter((s) => normal(s.texto).includes(normal(texto)))
  const ir = (a) => { setAbierta(false); setTexto(''); navegar(a) }
  return (
    <div className="ventanita" ref={caja}>
      <button type="button" className="boton-redondo" aria-label="Buscar sección" aria-expanded={abierta}
        onClick={() => setAbierta(!abierta)}>
        <Icono nombre="buscar" tamano={19} />
      </button>
      {abierta && (
        <div className="ventanita__caja" role="dialog" aria-label="Buscar sección">
          <input className="ventanita__buscar" autoFocus placeholder="Ir a… (ventas, clientes)" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && encontradas[0]) ir(encontradas[0].a) }} />
          <ul>
            {encontradas.map((s) => (
              <li key={s.a}><button type="button" onClick={() => ir(s.a)}><Icono nombre={s.icono} tamano={18} />{s.texto}</button></li>
            ))}
            {encontradas.length === 0 && <li className="ventanita__vacio">No hay una sección con ese nombre.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

// Avisos reales del negocio: huevos bajo el mínimo y fiado sin cobrar (del mismo resumen que usa Inicio).
function Avisos() {
  const { abierta, setAbierta, caja } = useVentanita()
  const navegar = useNavigate()
  const { data } = useQuery({ queryKey: ['inicio'], queryFn: () => api('/inicio/'), refetchInterval: 60_000 })
  const bajos = data?.stock.filter((s) => s.bajo_minimo) ?? []
  const deudas = data?.deudas.cantidad ?? 0
  const lista = [
    bajos.length > 0 && { a: '/inventario', icono: 'inventario', titulo: `${bajos.length} ${bajos.length === 1 ? 'huevo' : 'huevos'} bajo el mínimo`, texto: bajos.map((s) => s.producto_nombre).join(', ') },
    deudas > 0 && { a: '/cuentas', icono: 'cuentas', titulo: `${deudas} ${deudas === 1 ? 'deuda' : 'deudas'} sin cobrar`, texto: `Total ${moneda(data.deudas.total)}` },
  ].filter(Boolean)
  const ir = (a) => { setAbierta(false); navegar(a) }
  return (
    <div className="ventanita" ref={caja}>
      <button type="button" className="boton-redondo avisos" aria-expanded={abierta}
        aria-label={lista.length ? `Avisos: ${lista.length}` : 'Avisos: no hay'} onClick={() => setAbierta(!abierta)}>
        <Icono nombre="sobre" tamano={19} />
        {lista.length > 0 && <i className="avisos__punto" aria-hidden="true" />}
      </button>
      {abierta && (
        <div className="ventanita__caja ventanita__caja--der" role="dialog" aria-label="Avisos">
          <p className="ventanita__titulo">Avisos</p>
          {lista.length === 0 ? <p className="ventanita__vacio">Todo en orden: no hay avisos.</p> : (
            <ul>
              {lista.map((x) => (
                <li key={x.a}>
                  <button type="button" className="aviso" onClick={() => ir(x.a)}>
                    <span className="aviso__icono"><Icono nombre={x.icono} tamano={18} /></span>
                    <span><b>{x.titulo}</b><small>{x.texto}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// "Fondo" en el menú lateral: abre el mismo menú del login (momento del día y "Quieto").
// El menú flota al costado del botón (en el celular, arriba). Se dibuja en <body> con un portal, porque el lateral
// recorta lo que sobresale y en el celular se desliza (y eso correría un menú con posición fija).
const NOMBRE_MOMENTO = { manana: 'mañana', tarde: 'tarde', atardecer: 'atardecer', noche: 'noche' }

function OpcionFondo() {
  const [lugar, setLugar] = useState(null) // null = cerrado
  const boton = useRef(null)
  const menu = useRef(null)
  const { modo, quieto, momento } = useFondo()

  useEffect(() => {
    if (!lugar) return
    const cerrar = () => setLugar(null)
    const afuera = (e) => { if (!boton.current?.contains(e.target) && !menu.current?.contains(e.target)) cerrar() }
    const tecla = (e) => { if (e.key === 'Escape') { cerrar(); boton.current?.focus() } }
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', tecla)
    window.addEventListener('resize', cerrar)
    return () => {
      document.removeEventListener('pointerdown', afuera)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', cerrar)
    }
  }, [lugar])

  const alternar = () => {
    if (lugar) { setLugar(null); return }
    const r = boton.current.getBoundingClientRect()
    setLugar(esCelular() ? { left: r.left, top: r.top - 52 } : { left: r.right + 10, top: r.top + r.height / 2 - 22 })
  }

  return (
    <>
      <button ref={boton} type="button" className="nav-item" data-texto="Fondo" onClick={alternar}
        aria-haspopup="menu" aria-expanded={Boolean(lugar)} aria-controls="menu-fondo"
        aria-label={`Fondo: ${NOMBRE_MOMENTO[momento]}${modo === 'auto' ? ' (automático)' : ''}${quieto ? ', quieto' : ''}. Cambiar fondo`}>
        <span className="redondela redondela--fondo"><IconoMomento nombre={quieto ? 'quieto' : momento} /></span>
        <span className="nav-item__texto">Fondo</span>
      </button>
      {createPortal(
        <div ref={menu}>
          <MenuMomento id="menu-fondo" className="menu-momento--flotante" abierto={Boolean(lugar)}
            style={lugar ?? undefined} alElegir={() => setLugar(null)} />
        </div>,
        document.body,
      )}
    </>
  )
}
