import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import FormularioABM from '../components/FormularioABM'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import { api } from '../lib/api'
import { fecha, hora } from '../lib/formato'
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

  // Después de una merma o un ajuste cambian el stock, los movimientos y los precios del punto de venta.
  function cerrarCarga() {
    setCargando(null)
    for (const clave of ['stock', 'movimientos-inventario', 'precios']) cliente.invalidateQueries({ queryKey: [clave] })
  }

  const nuevaMerma = <Boton icono="mas" onClick={() => setCargando({ tipo: 'MERMA' })}>Registrar merma o ajuste</Boton>

  return (
    <>
      <CabeceraPagina titulo="Inventario" descripcion="Lo que hay de cada huevo. El stock se cuenta en bandejas de 30." acciones={nuevaMerma} />

      {bajos.length > 0 && (
        <p className="aviso-stock" role="status">
          <strong>Para reponer:</strong> {bajos.map((s) => s.producto_nombre).join(', ')} {bajos.length === 1 ? 'está' : 'están'} por debajo del mínimo.
        </p>
      )}

      {stock.isPending && <p className="abm-cargando">Cargando…</p>}
      {stock.isError && <EstadoVacio icono="cerrar" titulo="No se pudo cargar el stock" texto={stock.error.message} />}
      {stock.isSuccess && filas.length === 0 && (
        <EstadoVacio icono="inventario" titulo="Todavía no hay stock" texto="El stock aparece cuando registrás la primera compra." />
      )}

      <div className="stock-tarjetas">
        {filas.map((s) => (
          <article key={s.producto} className={`stock-tarjeta${s.bajo_minimo ? ' is-bajo' : ''}`}>
            <header>
              <h2>{s.producto_nombre}</h2>
              {s.bajo_minimo ? <Insignia variante="peligro">Bajo mínimo</Insignia> : <Insignia variante="exito">Normal</Insignia>}
            </header>
            <p className="stock-tarjeta__total"><strong>{bandejas(s.cantidad_bandejas)}</strong> bandejas</p>
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

      <Movimientos productos={filas} />

      {cargando && <CargarMerma inicial={cargando} productos={filas} alCerrar={cerrarCarga} />}

      {minimo && (
        <FormularioABM recurso="stock" id={minimo.producto} alCerrar={() => { setMinimo(null); cliente.invalidateQueries({ queryKey: ['stock'] }) }}
          titulo={`Stock mínimo de ${minimo.producto_nombre}`} descripcion="Cuando el stock baja de este número, aparece el aviso para reponer.">
          {(errores) => (
            <Campo etiqueta="Mínimo en bandejas" name="stock_minimo_bandejas" type="number" inputMode="decimal" min="0" step="any"
              defaultValue={Number(minimo.stock_minimo_bandejas)} error={errores.stock_minimo_bandejas} data-foco />
          )}
        </FormularioABM>
      )}
    </>
  )
}

// Merma (rotura, vencimiento) o ajuste por conteo físico. Siempre con motivo.
function CargarMerma({ inicial, productos, alCerrar }) {
  const presentaciones = useQuery({
    queryKey: ['presentaciones', 'activas'],
    queryFn: () => api('/presentaciones/?estado=ACTIVO'),
  }).data?.results ?? []

  return (
    <FormularioABM recurso="movimientos-inventario" alCerrar={alCerrar} titulo="Registrar merma o ajuste"
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
            <Campo etiqueta="Cantidad" name="cantidad" type="number" inputMode="decimal" min="0" step="any"
              error={errores.cantidad} data-foco />
            <Campo as="select" etiqueta="En" name="presentacion" defaultValue="" error={errores.presentacion}>
              <option value="" disabled>Elegí</option>
              {presentaciones.map((p) => <option key={p.id_presentacion} value={p.id_presentacion}>{p.nombre}</option>)}
            </Campo>
          </div>
          <Campo etiqueta="Motivo" name="motivo" error={errores.motivo} maxLength={200} autoComplete="off"
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
