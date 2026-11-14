import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import Cifra from '../components/Cifra'
import Icono from '../components/Icono'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import { api } from '../lib/api'
import { fecha, hoyISO, moneda, numero } from '../lib/formato'
import { useEsAdministrador } from '../lib/sesion'
import '../styles/movimientos.css'
import '../styles/reportes.css'

// Reportes (Sprint 6 · solo administrador). Lo que pidió el dueño: ventas, compras,
// la comparación entre las dos y la ganancia. Se ve en pantalla, se baja en Excel o se imprime en PDF.
// Las cuentas las hace el servidor (apps/reportes/calculos.py); acá solo se muestran.

const iso = (d) => d.toLocaleDateString('en-CA')
function periodo(clave) {
  const hoy = new Date()
  if (clave === 'hoy') return [iso(hoy), iso(hoy)]
  if (clave === 'semana') {
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
    return [iso(lunes), iso(hoy)]
  }
  if (clave === 'anterior') {
    return [iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0))]
  }
  return [iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), iso(hoy)] // mes
}
const PERIODOS = [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['anterior', 'Mes anterior'], ['otro', 'Elegir fechas']]

export default function Reportes() {
  const esAdministrador = useEsAdministrador()
  const [clave, setClave] = useState('mes')
  const [propio, setPropio] = useState(() => periodo('mes'))
  const [desde, hasta] = clave === 'otro' ? propio : periodo(clave)
  const parametros = new URLSearchParams({ desde, hasta })

  const reporte = useQuery({
    queryKey: ['reportes', desde, hasta],
    queryFn: () => api(`/reportes/resumen/?${parametros}`),
    placeholderData: keepPreviousData,
    enabled: esAdministrador && Boolean(desde && hasta),
  })

  if (!esAdministrador) {
    return <EstadoVacio icono="reportes" titulo="Solo el administrador" texto="Los reportes los ve el dueño del negocio." />
  }

  const r = reporte.data
  const acciones = (
    <div className="reporte__acciones">
      <a className="btn btn--secundario" href={`/api/reportes/excel/?${parametros}`} download>
        <Icono nombre="descargar" /><span>Descargar Excel</span>
      </a>
      <Boton icono="imprimir" onClick={() => window.print()}>Imprimir / PDF</Boton>
    </div>
  )

  return (
    <div className="reporte">
      <CabeceraPagina titulo="Reportes" descripcion="Cómo le fue al negocio: ventas, compras, gastos y ganancia." acciones={acciones} />
      <p className="reporte__titulo-impresion">Huevería Marpe · Reporte del {fecha(desde)} al {fecha(hasta)}</p>

      <div className="reporte__periodo">
        <div className="segmentado" role="group" aria-label="Período">
          {PERIODOS.map(([v, texto]) => (
            <button key={v} type="button" className="segmentado__opcion" aria-pressed={clave === v}
              onClick={() => { if (v === 'otro') setPropio([desde, hasta]); setClave(v) }}>{texto}</button>
          ))}
        </div>
        {clave === 'otro' && (
          <div className="reporte__fechas">
            <Campo etiqueta="Desde" type="date" value={propio[0]} max={propio[1]} onChange={(e) => setPropio([e.target.value, propio[1]])} />
            <Campo etiqueta="Hasta" type="date" value={propio[1]} min={propio[0]} max={hoyISO()} onChange={(e) => setPropio([propio[0], e.target.value])} />
          </div>
        )}
      </div>

      {reporte.isError && <EstadoVacio icono="alerta" titulo="No se pudo armar el reporte" texto={reporte.error.message} />}
      {reporte.isPending && <p className="abm-cargando">Calculando…</p>}

      {r && (
        <div className={reporte.isFetching ? 'reporte__datos is-actualizando' : 'reporte__datos'}>
          <div className="cifras">
            <Cifra titulo="Ventas" valor={moneda(r.ventas.total)} destacada
              nota={`${numero(r.ventas.cantidad)} ${r.ventas.cantidad === 1 ? 'venta' : 'ventas'} · promedio ${moneda(r.ventas.ticket_promedio)}`} />
            <Cifra titulo="Compras" valor={moneda(r.compras.total)} nota={`${numero(r.compras.cantidad)} ${r.compras.cantidad === 1 ? 'compra' : 'compras'}`} />
            <Cifra titulo="Gastos" valor={moneda(r.gastos.total)} nota={`Fijos ${moneda(r.gastos.fijos)} · variables ${moneda(r.gastos.variables)}`} />
            <Cifra titulo="Ganancia neta" valor={<Signo valor={r.ganancia.neta} />} nota={`Bruta ${moneda(r.ganancia.bruta)}`} />
          </div>

          <div className="reporte__grilla">
            <Panel titulo="Ventas y compras" className="reporte__comparacion"
              accion={<Leyenda />}>
              <Barras puntos={r.evolucion.puntos} agrupado={r.evolucion.agrupado} />
              <p className="reporte__balance">
                Balance del período (ventas − compras − gastos): <Signo valor={r.balance} />
              </p>
            </Panel>

            <Panel titulo="Cómo se llega a la ganancia">
              <dl className="cuenta-ganancia">
                <div><dt>Ventas</dt><dd>{moneda(r.ventas.total)}</dd></div>
                <div className="resta"><dt>Costo de lo vendido</dt><dd>− {moneda(r.ganancia.costo_vendido)}</dd></div>
                <div className="subtotal"><dt>Ganancia bruta</dt><dd><Signo valor={r.ganancia.bruta} /></dd></div>
                <div className="resta"><dt>Gastos (fijos y variables)</dt><dd>− {moneda(r.gastos.total)}</dd></div>
                <div className="total"><dt>Ganancia neta</dt><dd><Signo valor={r.ganancia.neta} /></dd></div>
              </dl>
              <p className="suave reporte__nota">
                El costo de lo vendido sale del costo promedio por bandeja de las compras del período
                (el mismo cálculo del precio sugerido).
              </p>
              {r.ganancia.sin_costo.length > 0 && (
                <p className="reporte__aviso">Sin costo cargado, no entran en la ganancia: {r.ganancia.sin_costo.join(', ')}.</p>
              )}
            </Panel>

            <Panel titulo="Cómo cobraste">
              <MediosDePago medios={r.ventas.por_medio} total={Number(r.ventas.total)} />
              {r.ventas.anuladas.cantidad > 0 && (
                <p className="suave reporte__nota">
                  {r.ventas.anuladas.cantidad} {r.ventas.anuladas.cantidad === 1 ? 'venta anulada' : 'ventas anuladas'} por {moneda(r.ventas.anuladas.total)}: no suman.
                </p>
              )}
            </Panel>
          </div>

          <Panel titulo="Lo vendido de cada huevo">
            {r.productos.length === 0 ? <p className="suave">No hubo ventas en el período.</p> : (
              <div className="tabla-wrap">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Huevo</th><th scope="col">Cómo se vendió</th><th scope="col" className="num">Bandejas</th>
                      <th scope="col" className="num">Vendido</th><th scope="col" className="num">Costo</th>
                      <th scope="col" className="num">Ganancia bruta</th><th scope="col" className="num">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.productos.map((p) => (
                      <tr key={p.producto}>
                        <td><strong>{p.nombre}</strong></td>
                        <td className="suave">{Object.entries(p.por_presentacion).map(([n, c]) => `${numero(c)} ${n}`).join(' · ')}</td>
                        <td className="num">{numero(p.bandejas)}</td>
                        <td className="num">{moneda(p.vendido)}</td>
                        <td className="num">{p.costo === null ? '—' : moneda(p.costo)}</td>
                        <td className="num">{p.ganancia === null ? '—' : <Signo valor={p.ganancia} />}</td>
                        <td className="num">{p.ganancia === null || Number(p.vendido) === 0 ? '—'
                          : <Insignia variante={Number(p.ganancia) >= 0 ? 'exito' : 'peligro'}>{Math.round((p.ganancia / p.vendido) * 100)} %</Insignia>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

// Importe en verde si es ganancia y en rojo si es pérdida (con el signo escrito, no solo el color).
function Signo({ valor }) {
  const n = Number(valor)
  return <span className={n < 0 ? 'importe--sale' : n > 0 ? 'importe--entra' : ''}>{n < 0 ? '− ' : ''}{moneda(Math.abs(n))}</span>
}

function Leyenda() {
  return (
    <ul className="leyenda" aria-hidden="true">
      <li><span className="leyenda__marca is-ventas" />Ventas</li>
      <li><span className="leyenda__marca is-compras" />Compras</li>
    </ul>
  )
}

// Gráfico de barras: ventas y compras lado a lado por día (o por mes). SVG propio, sin librerías.
const compacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 })
const MESES = new Intl.DateTimeFormat('es-AR', { month: 'short' })

function Barras({ puntos, agrupado }) {
  // Se dibuja al ancho real del panel: así el texto del eje no se achica ni se agranda.
  const ref = useRef(null)
  const [ancho, setAncho] = useState(800)
  useEffect(() => {
    const observador = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.round(e.contentRect.width))))
    observador.observe(ref.current)
    return () => observador.disconnect()
  }, [])

  const alto = 240
  const izquierda = 52
  const paso = (ancho - izquierda - 8) / puntos.length
  const maximo = Math.max(1, ...puntos.flatMap((p) => [Number(p.ventas), Number(p.compras)]))
  const escala = (v) => (Number(v) / maximo) * (alto - 28)
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maximo)
  const cada = Math.ceil(puntos.length / Math.max(4, Math.floor(ancho / 56))) // etiquetas sin amontonar
  const etiqueta = (iso) => (agrupado === 'mes' ? MESES.format(new Date(`${iso}T00:00`)) : String(Number(iso.slice(8))))
  const barra = Math.min(28, Math.max(3, paso / 2 - 3))

  return (
    <figure className="barras" ref={ref}>
      <svg width={ancho} height={alto + 22} viewBox={`0 0 ${ancho} ${alto + 22}`} role="img"
        aria-label={`Ventas y compras ${agrupado === 'mes' ? 'por mes' : 'por día'}`}>
        {marcas.map((m) => {
          const y = alto - escala(m)
          return (
            <g key={m}>
              <line x1={izquierda} x2={ancho} y1={y} y2={y} className="barras__grilla" />
              <text x={izquierda - 6} y={y + 4} className="barras__eje" textAnchor="end">{compacto.format(m)}</text>
            </g>
          )
        })}
        {puntos.map((p, i) => {
          const x = izquierda + i * paso + (paso - barra * 2 - 2) / 2
          return (
            <g key={p.fecha}>
              <title>{`${fecha(p.fecha)} · ventas ${moneda(p.ventas)} · compras ${moneda(p.compras)}`}</title>
              <rect x={x} y={alto - escala(p.ventas)} width={barra} height={escala(p.ventas)} rx="2" className="barras__ventas" />
              <rect x={x + barra + 2} y={alto - escala(p.compras)} width={barra} height={escala(p.compras)} rx="2" className="barras__compras" />
              {i % cada === 0 && (
                <text x={izquierda + i * paso + paso / 2} y={alto + 16} className="barras__eje" textAnchor="middle">{etiqueta(p.fecha)}</text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="sr-only">
        {puntos.filter((p) => Number(p.ventas) || Number(p.compras)).map((p) => `${fecha(p.fecha)}: ventas ${moneda(p.ventas)}, compras ${moneda(p.compras)}`).join('. ')}
      </figcaption>
    </figure>
  )
}

function MediosDePago({ medios, total }) {
  const filas = [['Efectivo', medios.efectivo], ['Transferencia', medios.transferencia], ['Fiado', medios.fiado]]
  return (
    <ul className="medios">
      {filas.map(([nombre, valor]) => {
        const parte = total ? Math.round((Number(valor) / total) * 100) : 0
        return (
          <li key={nombre}>
            <div className="medios__fila"><span>{nombre}</span><strong>{moneda(valor)}</strong></div>
            <div className="medios__barra"><span style={{ width: `${parte}%` }} /></div>
            <span className="suave">{parte} %</span>
          </li>
        )
      })}
    </ul>
  )
}
