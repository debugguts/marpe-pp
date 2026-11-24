import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import Cifra from '../components/Cifra'
import Dona from '../components/Dona'
import FormularioABM from '../components/FormularioABM'
import Icono from '../components/Icono'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import { api } from '../lib/api'
import { fecha, hora, hoyISO, numero } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/movimientos.css'
import '../styles/inventario.css'

// Inventario (S5 · HU-06 y HU-08). Una tarjeta por tipo de huevo con lo que hay,
// repartido en cajas, bandejas y unidades. Abajo, cada entrada y salida de stock.
// Las compras y ventas mueven el stock solas; acá se cargan las mermas y los ajustes por conteo.
const TIPOS = [
  ['', 'Todos'],
  ['INGRESO_COMPRA', 'Compras'],
  ['EGRESO_VENTA', 'Ventas'],
  ['MERMA', 'Mermas'],
  ['AJUSTE_POSITIVO', 'Ajustes +'],
  ['AJUSTE_NEGATIVO', 'Ajustes −'],
]
const SUMAN = ['INGRESO_COMPRA', 'AJUSTE_POSITIVO']

// "12.500000" → "12,5"
const bandejas = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })

export default function Inventario() {
  const cliente = useQueryClient()
  const sesion = useSesion()
  const esAdministrador = sesion.data?.rol === 'Administrador'
  const [cargando, setCargando] = useState(null) // null cerrado · { tipo, producto } carga de merma o ajuste
  const [minimo, setMinimo] = useState(null) // stock al que se le cambia el mínimo

  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api('/stock/') })
  const filas = stock.data ?? []
  const bajos = filas.filter((s) => s.bajo_minimo)
  const mes = hoyISO().slice(0, 7)
  const mermas = useQuery({
    queryKey: ['movimientos-inventario', 'mermas', mes],
    queryFn: () => api(`/movimientos-inventario/?tipo=MERMA&desde=${mes}-01&page_size=500`),
  })
  const totalBandejas = filas.reduce((s, f) => s + Number(f.cantidad_bandejas), 0)
  const mermadas = (mermas.data?.results ?? []).reduce((s, m) => s + Math.abs(Number(m.cantidad_bandejas)), 0)
  const partes = filas.map((f, i) => ({ nombre: f.producto_nombre, valor: Math.max(0, Number(f.cantidad_bandejas)), color: COLORES_STOCK[i % COLORES_STOCK.length] }))
    .sort((a, b) => b.valor - a.valor)

  // Después de una merma o un ajuste cambian el stock, los movimientos y los precios del punto de venta.
  function cerrarCarga() {
    setCargando(null)
    for (const clave of ['stock', 'movimientos-inventario', 'precios']) cliente.invalidateQueries({ queryKey: [clave] })
  }

  const nuevaMerma = <Boton icono="mas" onClick={() => setCargando({ tipo: 'MERMA' })}>Registrar merma o ajuste</Boton>

  return (
    <>
      <CabeceraPagina titulo="Inventario" descripcion="Lo que hay de cada huevo. El stock se cuenta en bandejas de 30." acciones={nuevaMerma} />

      {stock.isSuccess && filas.length > 0 && (
        <div className="cifras">
          <Cifra tono="oscuro" icono="inventario" titulo="Stock total" valor={`${bandejas(totalBandejas)} bandejas`}
            nota={`${numero(Math.round(totalBandejas * 30))} huevos en depósito`}
            insignia={`${filas.length} ${filas.length === 1 ? 'producto' : 'productos'}`} />
          <Cifra tono="salmon" icono="alerta" titulo="Bajo el mínimo" valor={`${bajos.length} ${bajos.length === 1 ? 'producto' : 'productos'}`}
            nota={bajos.length ? bajos.map((s) => s.producto_nombre).join(' · ') : 'Todo por encima del mínimo'}
            insignia={bajos.length ? 'Reponer esta semana' : 'Sin faltantes'} />
          <Cifra tono="arena" icono="huevo" titulo="Mermas del mes" valor={`${bandejas(mermadas)} bandejas`}
            nota="Rotos, sucios o vencidos" insignia={`${(mermas.data?.results ?? []).length} ${(mermas.data?.results ?? []).length === 1 ? "carga" : "cargas"}`} />
        </div>
      )}

      {stock.isPending && <p className="abm-cargando">Cargando…</p>}
      {stock.isError && <EstadoVacio icono="cerrar" titulo="No se pudo cargar el stock" texto={stock.error.message} />}
      {stock.isSuccess && filas.length === 0 && (
        <EstadoVacio icono="inventario" titulo="Todavía no hay stock" texto="El stock aparece cuando registrás la primera compra." />
      )}

      <div className={filas.length ? 'tablero-2' : undefined}>
      <div className="stock-tarjetas">
        {filas.map((s) => (
          <article key={s.producto} className={`stock-tarjeta${s.bajo_minimo ? ' is-bajo' : ''}`}>
            <header>
              <h2>{s.producto_nombre}</h2>
              {s.bajo_minimo ? <Insignia variante="peligro">Bajo mínimo</Insignia> : <Insignia variante="exito">Normal</Insignia>}
            </header>
            <p className="stock-tarjeta__total"><strong>{bandejas(s.cantidad_bandejas)}</strong> bandejas</p>
            <Nivel stock={Number(s.cantidad_bandejas)} minimo={Number(s.stock_minimo_bandejas)} bajo={s.bajo_minimo} />
            <dl className="stock-tarjeta__reparto">
              {s.por_presentacion.map((p) => (
                <div key={p.presentacion}>
                  <dt>{p.presentacion}</dt>
                  <dd>{p.cantidad}</dd>
                </div>
              ))}
            </dl>
            <footer>
              <span className="suave">Mínimo: {bandejas(s.stock_minimo_bandejas)} bandejas</span>
              <div className="stock-tarjeta__acciones">
                <Boton variante="fantasma" onClick={() => setCargando({ tipo: 'MERMA', producto: s.producto })}
                  aria-label={`Registrar merma de ${s.producto_nombre}`}>Merma</Boton>
                {esAdministrador && (
                  <Boton variante="fantasma" onClick={() => setMinimo(s)} aria-label={`Cambiar el mínimo de ${s.producto_nombre}`}>Mínimo</Boton>
                )}
              </div>
            </footer>
          </article>
        ))}
      </div>
      {filas.length > 0 && (
        <aside className="panel stock-lado" aria-labelledby="stock-distribucion">
          <h2 id="stock-distribucion" className="panel__titulo">Stock por producto</h2>
          <Dona partes={partes} etiqueta="Stock por producto" centro={bandejas(totalBandejas)} nota="bandejas" />
          <div className="recuadro">
            <span className="recuadro__titulo"><Icono nombre="alerta" tamano={17} /> Para reponer</span>
            <span>{bajos.length ? bajos.map((s) => s.producto_nombre).join(', ') : 'Nada por ahora.'}</span>
            <span className="recuadro__nota">La línea de cada tarjeta marca su mínimo.</span>
          </div>
        </aside>
      )}
      </div>

      <Movimientos productos={filas} />

      {cargando && <CargarMerma inicial={cargando} productos={filas} alCerrar={cerrarCarga} />}

      {minimo && (
        <FormularioABM recurso="stock" id={minimo.producto} alCerrar={() => { setMinimo(null); cliente.invalidateQueries({ queryKey: ['stock'] }) }}
          titulo={`Stock mínimo de ${minimo.producto_nombre}`} descripcion="Cuando el stock baja de este número, aparece el aviso para reponer." validar={validarMinimo}>
          {(errores) => (
            <Campo etiqueta="Mínimo en bandejas" name="stock_minimo_bandejas" type="number" inputMode="decimal" min="0" step="1" max={CANTIDAD_MAX}
              className="campo--importe" onKeyDown={sinSignos} onWheel={sinRueda}
              defaultValue={Number(minimo.stock_minimo_bandejas)} error={errores.stock_minimo_bandejas} data-foco />
          )}
        </FormularioABM>
      )}
    </>
  )
}

const CANTIDAD_MAX = 100000
const COLORES_STOCK = ['#C9B79F', 'var(--cat-otros)', '#B7825B', '#7A4A2E', 'var(--cat-servicios)', 'var(--cat-insumos)', 'var(--cat-mantenimiento)']

// Barra de nivel: cuánto hay comparado con el mínimo (la línea marca el mínimo).
function Nivel({ stock, minimo, bajo }) {
  const tope = Math.max(stock, minimo * 2, 1)
  return (
    <div className="nivel" role="img" aria-label={`${bandejas(stock)} bandejas; mínimo ${bandejas(minimo)}`}>
      <span className={`nivel__barra${bajo ? ' is-bajo' : ''}`} style={{ width: `${Math.min(100, (stock / tope) * 100)}%` }} />
      {minimo > 0 && <span className="nivel__minimo" style={{ left: `${(minimo / tope) * 100}%` }} title="Mínimo" />}
    </div>
  )
}
const soloEnteros = (e) => { if (['-', '+', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault() }
const sinSignos = (e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault() }
const sinRueda = (e) => e.currentTarget.blur() // la rueda del mouse no cambia el número

function validarMinimo(d) {
  const v = d.stock_minimo_bandejas
  if (v === '' || v === undefined) return { stock_minimo_bandejas: 'Indicá el mínimo (puede ser 0).' }
  if (!/^\d+(\.\d{1,3})?$/.test(v)) return { stock_minimo_bandejas: 'El mínimo tiene que ser 0 o más.' }
  if (Number(v) > CANTIDAD_MAX) return { stock_minimo_bandejas: 'El mínimo no puede pasar de 100.000 bandejas.' }
  return {}
}

// Merma (rotura, vencimiento) o ajuste por conteo físico. Siempre con motivo.
function CargarMerma({ inicial, productos, alCerrar }) {
  const presentaciones = useQuery({
    queryKey: ['presentaciones', 'activas'],
    queryFn: () => api('/presentaciones/?estado=ACTIVO'),
  }).data?.results ?? []

  // Revisa antes de mandar. Si saca huevos, controla que haya stock suficiente.
  function validar(d) {
    const e = {}
    if (!d.tipo_movimiento) e.tipo_movimiento = 'Elegí qué pasó.'
    if (!d.producto) e.producto = 'Elegí el huevo.'
    if (!d.presentacion) e.presentacion = 'Elegí en qué se cuenta.'
    if (!d.cantidad) e.cantidad = 'Indicá la cantidad.'
    else if (!/^\d+$/.test(d.cantidad) || Number(d.cantidad) < 1) e.cantidad = 'La cantidad va en números enteros mayores a 0.'
    else if (Number(d.cantidad) > CANTIDAD_MAX) e.cantidad = 'La cantidad no puede pasar de 100.000.'
    else if (d.tipo_movimiento !== 'AJUSTE_POSITIVO' && d.producto && d.presentacion) {
      const stock = productos.find((s) => String(s.producto) === d.producto)
      const pres = presentaciones.find((p) => String(p.id_presentacion) === d.presentacion)
      const hay = Number(stock?.cantidad_bandejas ?? 0)
      if (pres && Number(d.cantidad) * Number(pres.cantidad_bandejas_equivalentes) > hay + 1e-9) {
        e.cantidad = `No hay tanto: quedan ${bandejas(hay)} bandejas de ${stock?.producto_nombre ?? 'ese huevo'}.`
      }
    }
    const motivo = (d.motivo ?? '').trim()
    if (!motivo) e.motivo = 'Escribí el motivo.'
    else if (motivo.length < 3) e.motivo = 'El motivo tiene que tener al menos 3 letras.'
    return e
  }

  return (
    <FormularioABM recurso="movimientos-inventario" alCerrar={alCerrar} titulo="Registrar merma o ajuste" validar={validar}
      descripcion="Las compras y las ventas mueven el stock solas: acá van las roturas, pérdidas y correcciones por conteo.">
      {(errores) => (
        <>
          <Campo as="select" etiqueta="Qué pasó" name="tipo_movimiento" defaultValue={inicial.tipo} error={errores.tipo_movimiento}>
            <option value="MERMA">Merma: se rompieron o se perdieron huevos</option>
            <option value="AJUSTE_NEGATIVO">Ajuste: al contar había menos</option>
            <option value="AJUSTE_POSITIVO">Ajuste: al contar había más</option>
          </Campo>
          <Campo as="select" etiqueta="Huevo" name="producto" defaultValue={inicial.producto ?? ''} error={errores.producto}>
            <option value="" disabled>Elegí el huevo</option>
            {productos.map((s) => <option key={s.producto} value={s.producto}>{s.producto_nombre}</option>)}
          </Campo>
          <div className="fila-2">
            <Campo etiqueta="Cantidad" name="cantidad" type="number" inputMode="numeric" min="1" step="1" max={CANTIDAD_MAX}
              className="campo--importe" placeholder="0" onKeyDown={soloEnteros} onWheel={sinRueda}
              error={errores.cantidad} data-foco />
            <Campo as="select" etiqueta="En" name="presentacion" defaultValue="" error={errores.presentacion}>
              <option value="" disabled>Elegí</option>
              {presentaciones.map((p) => <option key={p.id_presentacion} value={p.id_presentacion}>{p.nombre}</option>)}
            </Campo>
          </div>
          <Campo etiqueta="Motivo" name="motivo" error={errores.motivo} maxLength={200} minLength={3} autoComplete="off"
            placeholder="Por ejemplo: 4 huevos rotos en la descarga" />
        </>
      )}
    </FormularioABM>
  )
}

// Historial de entradas y salidas de stock, con filtros.
function Movimientos({ productos }) {
  const [tipo, setTipo] = useState('')
  const [producto, setProducto] = useState('')
  const [pagina, setPagina] = useState(1)
  const parametros = new URLSearchParams({ page: pagina })
  if (tipo) parametros.set('tipo', tipo)
  if (producto) parametros.set('producto', producto)

  const movimientos = useQuery({
    queryKey: ['movimientos-inventario', tipo, producto, pagina],
    queryFn: () => api(`/movimientos-inventario/?${parametros}`),
    placeholderData: keepPreviousData,
  })
  const filas = movimientos.data?.results ?? []
  const cambiar = (fn) => (e) => { fn(e.target.value); setPagina(1) }

  return (
    <Panel titulo="Movimientos de stock" className="stock-movimientos"
      accion={(
        <Campo as="select" etiqueta="Huevo" value={producto} onChange={cambiar(setProducto)} className="stock-movimientos__filtro">
          <option value="">Todos</option>
          {productos.map((s) => <option key={s.producto} value={s.producto}>{s.producto_nombre}</option>)}
        </Campo>
      )}>
      <div className="segmentado" role="group" aria-label="Tipo de movimiento">
        {TIPOS.map(([v, texto]) => (
          <button key={v} type="button" className="segmentado__opcion" aria-pressed={tipo === v}
            onClick={() => { setTipo(v); setPagina(1) }}>{texto}</button>
        ))}
      </div>

      {filas.length === 0 ? (
        <p className="suave">{movimientos.isPending ? 'Cargando…' : 'No hay movimientos con esos filtros.'}</p>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Fecha</th><th scope="col">Huevo</th><th scope="col">Movimiento</th>
                <th scope="col" className="num">Bandejas</th><th scope="col">Motivo</th><th scope="col">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => {
                const suma = SUMAN.includes(m.tipo_movimiento)
                return (
                  <tr key={m.id_movimiento_inventario}>
                    <td>{fecha(m.fecha_hora)} <span className="suave">{hora(m.fecha_hora)}</span></td>
                    <td>{m.producto_nombre}</td>
                    <td><Insignia variante={m.tipo_movimiento === 'MERMA' ? 'peligro' : suma ? 'exito' : 'neutro'}>{m.tipo_texto}</Insignia></td>
                    <td className={`num ${suma ? 'importe--entra' : 'importe--sale'}`}>{suma ? '+' : '−'}{bandejas(m.cantidad_bandejas)}</td>
                    <td>{m.motivo || <span className="suave">—</span>}</td>
                    <td>{m.usuario_nombre}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(movimientos.data?.previous || movimientos.data?.next) && (
        <div className="paginado">
          <Boton variante="secundario" disabled={!movimientos.data?.previous} onClick={() => setPagina((p) => p - 1)}>Anterior</Boton>
          <span className="suave">Página {pagina}</span>
          <Boton variante="secundario" disabled={!movimientos.data?.next} onClick={() => setPagina((p) => p + 1)}>Siguiente</Boton>
        </div>
      )}
    </Panel>
  )
}
