import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Cifra from '../components/Cifra'
import Icono from '../components/Icono'
import { CabeceraPagina, EstadoVacio, Insignia, Panel } from '../components/ui'
import { api } from '../lib/api'
import { fechaLarga, hora, moneda, numero } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/movimientos.css'
import '../styles/inicio.css'

// Inicio: cómo viene el día, con datos reales (GET /api/inicio/).
// Lo ven los dos roles; las compras y los gastos del día solo aparecen para el administrador.
// Se actualiza solo cada minuto, así queda abierto en el mostrador.

const MEDIOS = [
  ['efectivo', 'Efectivo', 'var(--marron)'],
  ['transferencia', 'Transferencias', 'var(--rosa-hover)'],
  ['fiado', 'Fiado', 'color-mix(in srgb, var(--marron) 38%, var(--arena))'],
]
const VARIANTE = { 'Venta': 'marca', 'Venta anulada': 'neutro', 'Cobro de deuda': 'exito', 'Compra': 'neutro', 'Gasto': 'neutro', 'Merma': 'peligro' }
const DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'short' })
const corto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }) // 87500 → «87,5 mil»
const bandejas = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })

export default function Inicio() {
  const usuario = useSesion().data
  const inicio = useQuery({ queryKey: ['inicio'], queryFn: () => api('/inicio/'), refetchInterval: 60_000 })
  const d = inicio.data
  const nuevaVenta = <Link className="btn btn--primario" to="/ventas"><Icono nombre="ventas" /><span>Nueva venta</span></Link>

  return (
    <>
      <CabeceraPagina titulo={`Hola${usuario?.nombre ? `, ${usuario.nombre.split(' ')[0]}` : ''}`}
        descripcion={fechaLarga(new Date())} acciones={nuevaVenta} />

      {inicio.isPending && <p className="abm-cargando">Cargando…</p>}
      {inicio.isError && <EstadoVacio icono="alerta" titulo="No se pudo cargar el resumen" texto={inicio.error.message} />}

      {d && (
        <>
          <div className="cifras">
            <Cifra titulo="Vendido hoy" valor={moneda(d.ventas.total)} destacada
              nota={`${numero(d.ventas.cantidad)} ${d.ventas.cantidad === 1 ? 'venta' : 'ventas'}`} />
            <Cifra titulo="En la caja" valor={d.caja ? moneda(d.caja.saldo_actual) : 'Cerrada'}
              nota={d.caja ? `Abrió ${d.caja.usuario_apertura_nombre} a las ${hora(d.caja.fecha_hora_apertura)}` : 'Abrila para cobrar en efectivo'} />
            <Cifra titulo="Fiado sin cobrar" valor={moneda(d.deudas.total)}
              nota={`${numero(d.deudas.cantidad)} ${d.deudas.cantidad === 1 ? 'deuda' : 'deudas'}`} />
            <Cifra titulo="Para reponer" valor={numero(d.stock.filter((s) => s.bajo_minimo).length)}
              nota={`de ${d.stock.length} huevos`} />
          </div>

          <div className="inicio-grid">
            <Panel className="inicio-ventas" titulo="Ventas de hoy"
              accion={d.caja ? <Insignia variante="exito">Caja abierta</Insignia> : <Link className="inicio-link" to="/caja">Abrir caja</Link>}>
              <Reparto medios={d.ventas.por_medio} total={Number(d.ventas.total)} />
              <Semana dias={d.semana} />
            </Panel>

            <Panel className="inicio-stock" titulo="Stock" accion={<Link className="inicio-link" to="/inventario">Ver inventario</Link>}>
              {d.stock.length === 0 ? <p className="suave">Todavía no hay stock: aparece con la primera compra.</p> : (
                <ul className="stock-lista">
                  {d.stock.map((s) => {
                    const minimo = Number(s.stock_minimo_bandejas)
                    const lleno = Math.min(100, (Number(s.cantidad_bandejas) / Math.max(minimo * 2, 1)) * 100)
                    return (
                      <li key={s.producto} className={s.bajo_minimo ? 'is-bajo' : ''}>
                        <div className="stock-lista__fila">
                          <span>{s.producto_nombre}</span>
                          <strong>{bandejas(s.cantidad_bandejas)} <small>bandejas</small></strong>
                        </div>
                        <div className="stock-lista__barra" aria-hidden="true">
                          <span style={{ width: `${lleno}%` }} />
                          <i style={{ left: '50%' }} title="Mínimo" />
                        </div>
                        {s.bajo_minimo && <span className="stock-lista__aviso">Bajo el mínimo de {bandejas(minimo)}</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>

            <Panel className="inicio-mov" titulo="Movimientos de hoy">
              {d.movimientos.length === 0 ? <p className="suave">Todavía no hubo movimientos hoy.</p> : (
                <div className="tabla-wrap">
                  <table className="tabla">
                    <caption className="sr-only">Últimos movimientos del día</caption>
                    <thead>
                      <tr>
                        <th scope="col">Hora</th><th scope="col">Tipo</th><th scope="col">Detalle</th>
                        <th scope="col">Pago</th><th scope="col" className="num">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.movimientos.map((m, i) => (
                        <tr key={i} className={m.tipo === 'Venta anulada' ? 'is-anulada' : ''}>
                          <td>{m.hora ? hora(m.hora) : <span className="suave">—</span>}</td>
                          <td><Insignia variante={VARIANTE[m.tipo] ?? 'neutro'}>{m.tipo}</Insignia></td>
                          <td>{m.detalle}</td>
                          <td>{m.pago === 'Fiado' ? <Insignia variante="aviso">Fiado</Insignia> : m.pago ?? <span className="suave">—</span>}</td>
                          <td className={`num ${m.sentido === 'entra' ? 'importe--entra' : m.sentido === 'sale' ? 'importe--sale' : ''}`}>
                            {m.importe === null ? '—' : `${m.sentido === 'sale' ? '− ' : ''}${moneda(m.importe)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  )
}

// Barra partida por medio de pago, con el importe de cada uno.
function Reparto({ medios, total }) {
  return (
    <>
      <div className="reparto" aria-hidden="true">
        {total > 0
          ? MEDIOS.map(([clave, , color]) => <span key={clave} style={{ flexGrow: Number(medios[clave]), '--sw': color }} />)
          : <span style={{ flexGrow: 1, '--sw': 'var(--arena)' }} />}
      </div>
      <dl className="hechos">
        {MEDIOS.map(([clave, texto, color]) => (
          <div key={clave} style={{ '--sw': color }}>
            <dt>{texto}</dt>
            <dd>{moneda(medios[clave])}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

// Lo vendido en los últimos 7 días; hoy, resaltado.
function Semana({ dias }) {
  const maximo = Math.max(1, ...dias.map((x) => Number(x.total)))
  return (
    <figure className="semana">
      <figcaption>Últimos 7 días</figcaption>
      <ol>
        {dias.map((x, i) => {
          const hoy = i === dias.length - 1
          return (
            <li key={x.fecha} className={hoy ? 'is-hoy' : ''} title={moneda(x.total)}>
              <span className="semana__valor">{Number(x.total) ? corto.format(x.total) : ''}</span>
              <span className="semana__barra" style={{ height: `${Math.max(2, (Number(x.total) / maximo) * 100)}%` }} />
              <span className="semana__dia">{hoy ? 'Hoy' : DIA.format(new Date(`${x.fecha}T00:00`))}</span>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}
