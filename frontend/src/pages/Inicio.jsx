import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Icono from '../components/Icono'
import { EstadoVacio } from '../components/ui'
import { api } from '../lib/api'
import { hora, moneda, numero } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/tablero.css'

// Inicio con el diseño elegido por el cliente (Sprint 9), con datos reales (GET /api/inicio/).
// Tarjetas: Caja de hoy, Vendido hoy, Ventas (semana o meses), Fiado sin cobrar, Para reponer y Movimientos de hoy.
// Lo ven los dos roles; las compras y los gastos del día solo aparecen para el administrador.
// Se actualiza solo cada minuto, así queda abierto en el mostrador.

const corto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }) // 87500 → «87,5 mil»
const DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'short' })
const MES = new Intl.DateTimeFormat('es-AR', { month: 'short' })
const bandejas = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })
const sinPunto = (t) => t.replace('.', '').toUpperCase()

// Diferencia en % entre dos importes («+12,8 %»); null si no hay con qué comparar.
function variacion(actual, anterior) {
  const a = Number(actual)
  const b = Number(anterior)
  if (!b) return null
  const p = ((a - b) / b) * 100
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
}

export default function Inicio() {
  const usuario = useSesion().data
  const esAdministrador = usuario?.rol === 'Administrador'
  const inicio = useQuery({ queryKey: ['inicio'], queryFn: () => api('/inicio/'), refetchInterval: 60_000 })
  const d = inicio.data
  const primerNombre = usuario?.nombre?.split(' ')[0]

  return (
    <>
      <header className="cab-pagina inicio-cab">
        <h1>Hola{primerNombre && <>, <span>{primerNombre}</span></>}</h1>
        <Link className="boton-pildora" to="/ventas"><Icono nombre="mas" tamano={18} /><span>Nueva venta</span></Link>
      </header>

      {inicio.isPending && <p className="abm-cargando">Cargando…</p>}
      {inicio.isError && <EstadoVacio icono="alerta" titulo="No se pudo cargar el resumen" texto={inicio.error.message} />}

      {d && (
        <div className="tablero">
          <div className="tablero__col">
            <CajaDeHoy caja={d.caja} />
            <section className="tarjeta vendido" aria-label="Vendido hoy">
              <div>
                <p className="tarjeta__sub">Vendido hoy</p>
                <p className="vendido__total">{moneda(d.ventas.total)}</p>
              </div>
              <span className="etiqueta" title="Comparado con lo vendido ayer">
                {variacion(d.ventas.total, d.ayer.total) ?? `${numero(d.ventas.cantidad)} ${d.ventas.cantidad === 1 ? 'venta' : 'ventas'}`}
              </span>
            </section>
          </div>

          <Ventas semana={d.semana} meses={d.meses} conReportes={esAdministrador} />

          <section className="tarjeta tablero__der" aria-labelledby="fiado-titulo">
            <Cabecera id="fiado-titulo" titulo="Fiado sin cobrar" sub="Lo que deben los clientes" a="/cuentas" />
            <div className="fiado">
              <p className="tarjeta__sub">Total adeudado</p>
              <p className="fiado__total">{moneda(d.deudas.total)}</p>
              <p className="tarjeta__sub">{numero(d.deudas.cantidad)} {d.deudas.cantidad === 1 ? 'deuda' : 'deudas'} · fiado de los últimos 14 días</p>
            </div>
            <Curva dias={d.deudas.fiado_por_dia} />
            <div className="fiado__botones">
              <Link className="boton-pildora" to="/cuentas">Cobrar <span aria-hidden="true">↑</span></Link>
              <Link className="boton-pildora boton-pildora--claro" to="/cuentas">Ver deudas <span aria-hidden="true">↓</span></Link>
            </div>
            <Reponer stock={d.stock} />
          </section>

          <section className="tarjeta tablero__mov" aria-labelledby="mov-titulo">
            <Cabecera id="mov-titulo" titulo="Movimientos de hoy" sub="Ventas, cobros y ajustes recientes" />
            {d.movimientos.length === 0 ? <p className="tarjeta__sub">Todavía no hubo movimientos hoy.</p> : <Movimientos filas={d.movimientos} />}
          </section>
        </div>
      )}
    </>
  )
}

function Cabecera({ id, titulo, sub, a, children }) {
  return (
    <div className="tarjeta__cab">
      <div>
        <h2 id={id}>{titulo}</h2>
        {sub && <p className="tarjeta__sub">{sub}</p>}
      </div>
      {children}
      {a && <Link className="flecha" to={a} aria-label={`Ir a ${titulo}`}><Icono nombre="flecha" tamano={16} /></Link>}
    </div>
  )
}

function CajaDeHoy({ caja }) {
  return (
    <section className="tarjeta" aria-labelledby="caja-titulo">
      <Cabecera id="caja-titulo" titulo="Caja de hoy" sub="Efectivo en el cajón" a="/caja" />
      {caja ? (
        <div className="caja-marron">
          <p>Caja abierta · {hora(caja.fecha_hora_apertura)}</p>
          <p className="caja-marron__saldo">{moneda(caja.saldo_actual)}</p>
          <p className="caja-marron__pie"><span>Inicial {moneda(caja.saldo_inicial)}</span><span>{caja.usuario_apertura_nombre}</span></p>
        </div>
      ) : (
        <div className="caja-marron is-cerrada">
          <p>La caja está cerrada</p>
          <p className="caja-marron__saldo">Cerrada</p>
          <p className="caja-marron__pie"><Link to="/caja">Abrila para cobrar en efectivo →</Link></p>
        </div>
      )}
    </section>
  )
}

// Barras redondeadas: últimos 7 días o últimos 6 meses. La última (hoy / este mes) va resaltada con
// su diferencia con la anterior.
function Ventas({ semana, meses, conReportes }) {
  const [vista, setVista] = useState('meses')
  const datos = vista === 'meses'
    ? meses.map((m) => ({ clave: m.mes, total: Number(m.total), texto: sinPunto(MES.format(new Date(`${m.mes}-01T00:00`))) }))
    : semana.map((x, i) => ({ clave: x.fecha, total: Number(x.total), texto: i === semana.length - 1 ? 'HOY' : sinPunto(DIA.format(new Date(`${x.fecha}T00:00`))) }))
  const maximo = Math.max(1, ...datos.map((x) => x.total))
  const ultimo = datos.length - 1
  const cambio = variacion(datos[ultimo].total, datos[ultimo - 1]?.total)
  const escala = [1, 0.75, 0.5, 0.25, 0].map((f) => maximo * f)

  return (
    <section className="tarjeta ventas-graf" aria-labelledby="ventas-titulo">
      <Cabecera id="ventas-titulo" titulo={vista === 'meses' ? 'Ventas del semestre' : 'Ventas de la semana'} a={conReportes ? '/reportes' : undefined}>
        <div className="segmento" role="group" aria-label="Ver por">
          <button type="button" aria-pressed={vista === 'semana'} onClick={() => setVista('semana')}>Semana</button>
          <button type="button" aria-pressed={vista === 'meses'} onClick={() => setVista('meses')}>Meses</button>
        </div>
      </Cabecera>
      <figure className="barras">
        <figcaption className="sr-only">
          {datos.map((x) => `${x.texto}: ${moneda(x.total)}`).join('; ')}
        </figcaption>
        <ol className="barras__escala" aria-hidden="true">
          {escala.map((v, i) => <li key={i}>{v ? corto.format(v) : '0'}</li>)}
        </ol>
        <ol className="barras__lista" aria-hidden="true">
          {datos.map((x, i) => (
            <li key={x.clave} className={i === ultimo ? 'is-actual' : ''} title={moneda(x.total)}>
              <div className="barras__hueco">
                <span className="barras__barra" style={{ height: `${Math.max(4, (x.total / maximo) * 100)}%` }}>
                  {i === ultimo && cambio && <span className="barras__globo">{cambio}</span>}
                </span>
              </div>
              <span className="barras__texto">{x.texto}</span>
            </li>
          ))}
        </ol>
      </figure>
    </section>
  )
}

// Curva suave de lo fiado por día (SVG hecho a mano, sin librerías).
function Curva({ dias }) {
  const W = 320
  const H = 110
  const valores = dias.map((x) => Number(x.total))
  const maximo = Math.max(1, ...valores)
  const puntos = valores.map((v, i) => [(W * i) / (valores.length - 1), H - 10 - (v / maximo) * (H - 24)])
  const d = puntos.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x} ${y}`
    const [px, py] = puntos[i - 1]
    const medio = (px + x) / 2
    return `${acc} C${medio} ${py} ${medio} ${y} ${x} ${y}`
  }, '')
  return (
    <svg className="curva" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="curva-relleno" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#654E3F" stopOpacity="0.22" />
          <stop offset="1" stopColor="#654E3F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W} ${H} L0 ${H}Z`} fill="url(#curva-relleno)" />
      <path d={d} fill="none" stroke="#5A4538" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Reponer({ stock }) {
  const bajos = stock.filter((s) => s.bajo_minimo)
  return (
    <div className="reponer">
      <h2>Para reponer</h2>
      <p className="tarjeta__sub">Bajo el mínimo</p>
      <p className="reponer__cuenta">
        <span className={bajos.length ? 'is-rojo' : ''}>{bajos.length}</span>
        {bajos.length > 0 ? <span className="etiqueta etiqueta--roja">urgente</span> : <span className="etiqueta etiqueta--verde">todo bien</span>}
      </p>
      <ul>
        {bajos.map((s) => {
          const minimo = Number(s.stock_minimo_bandejas)
          const parte = Math.min(100, (Number(s.cantidad_bandejas) / Math.max(minimo, 1)) * 100)
          return (
            <li key={s.producto}>
              <span>{s.producto_nombre}</span>
              <b>{bandejas(s.cantidad_bandejas)}</b>
              <span className="reponer__barra" aria-hidden="true"><i style={{ width: `${parte}%` }} /></span>
            </li>
          )
        })}
      </ul>
      <Link className="reponer__link" to="/inventario">Ver inventario →</Link>
    </div>
  )
}

const ESTADO = (m) => {
  if (m.tipo === 'Venta anulada') return ['Anulada', 'gris']
  if (m.pago === 'Fiado') return ['Debe', 'rojo']
  if (m.sentido === 'entra') return ['Cobrado', 'verde']
  if (m.sentido === 'sale') return ['Pagado', 'gris']
  return [m.tipo, 'gris']
}
const iniciales = (texto) => (texto || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

function Movimientos({ filas }) {
  return (
    <div className="tabla-wrap">
      <table className="tabla-suave">
        <caption className="sr-only">Movimientos de hoy</caption>
        <thead>
          <tr>
            <th scope="col">Cliente</th><th scope="col">Hora</th><th scope="col">Pago</th>
            <th scope="col">Estado</th><th scope="col" className="num">Importe</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((m, i) => {
            const [estado, color] = ESTADO(m)
            return (
              <tr key={i} className={m.tipo === 'Venta anulada' ? 'is-anulada' : ''}>
                <td>
                  <span className="persona">
                    <span className="persona__ini" aria-hidden="true">{iniciales(m.quien)}</span>
                    <span><b>{m.quien}</b><small>{m.tipo === 'Venta' ? m.que : `${m.tipo} · ${m.que}`}</small></span>
                  </span>
                </td>
                <td>{m.hora ? hora(m.hora) : '—'}</td>
                <td>{m.pago ?? '—'}</td>
                <td><span className={`punto punto--${color}`}>{estado}</span></td>
                <td className="num">{m.importe === null ? '—' : `${m.sentido === 'sale' ? '− ' : ''}${moneda(m.importe)}`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
