import { useDeferredValue, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import Icono from '../components/Icono'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { contenidoDe, hora, hoyISO, moneda, numero } from '../lib/formato'
import '../styles/ventas.css'

// Punto de venta (S5-11 · HU-05). A la izquierda los productos con su precio;
// a la derecha la venta en curso. El total y el control de stock se calculan acá
// para avisar antes de confirmar, pero quien decide es la API (precio vigente y stock real).
const CONSUMIDOR_FINAL_ID = 1

export default function Ventas() {
  const cliente = useQueryClient()
  const precios = useQuery({ queryKey: ['precios', 'lista'], queryFn: () => api('/precios/') })
  const caja = useQuery({ queryKey: ['caja', 'actual'], queryFn: () => api('/cajas/actual/') })

  const [lineas, setLineas] = useState([]) // [{ clave, producto, presentacion, nombre, precio, bandejas, cantidad }]
  const [modalidad, setModalidad] = useState('CONTADO')
  const [medio, setMedio] = useState('EFECTIVO')
  const [referencia, setReferencia] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [hecha, setHecha] = useState(null) // última venta registrada

  const productos = agruparPorProducto(precios.data ?? [])
  const total = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0)
  const faltantes = sinStock(lineas, productos)
  const sinCaja = modalidad === 'CONTADO' && medio === 'EFECTIVO' && caja.isSuccess && !caja.data

  const registrar = useMutation({
    mutationFn: () => api('/ventas/', {
      metodo: 'POST',
      datos: {
        modalidad,
        ...(clienteId && { cliente: Number(clienteId) }),
        medio_pago: modalidad === 'CONTADO' ? medio : null,
        referencia_transferencia: referencia,
        detalles: lineas.map((l) => ({ producto: l.producto, presentacion: l.presentacion, cantidad: l.cantidad })),
      },
    }),
    onSuccess: (venta) => {
      setHecha(venta)
      setLineas([]); setReferencia(''); setClienteId(''); setModalidad('CONTADO')
      // Cambiaron el stock, la caja y las ventas del día: se vuelven a pedir solos.
      cliente.invalidateQueries({ queryKey: ['precios'] })
      cliente.invalidateQueries({ queryKey: ['caja'] })
      cliente.invalidateQueries({ queryKey: ['ventas'] })
    },
  })
  const errores = erroresDe(registrar.error)

  // Suma "cuantas" unidades de esa presentación (1 al tocar; 12 con el botón Docena).
  function agregar(producto, p, cuantas = 1) {
    setHecha(null); registrar.reset()
    const clave = `${producto.producto}-${p.presentacion}`
    setLineas((actuales) => actuales.some((l) => l.clave === clave)
      ? actuales.map((l) => (l.clave === clave ? { ...l, cantidad: l.cantidad + cuantas } : l))
      : [...actuales, {
        clave, producto: producto.producto, presentacion: p.presentacion,
        nombre: `${producto.nombre} · ${p.presentacion_nombre}`,
        precio: Number(p.precio), bandejas: Number(p.bandejas), cantidad: cuantas,
      }])
  }
  const cambiarCantidad = (clave, cantidad) =>
    setLineas((actuales) => actuales.map((l) => (l.clave === clave ? { ...l, cantidad } : l)))
  const quitar = (clave) => setLineas((actuales) => actuales.filter((l) => l.clave !== clave))

  const puedeConfirmar = lineas.length > 0 && lineas.every((l) => l.cantidad > 0)
    && faltantes.size === 0 && !sinCaja
    && (modalidad === 'CONTADO' || clienteId)
    && !(modalidad === 'CONTADO' && medio === 'TRANSFERENCIA' && !referencia.trim())

  return (
    <>
      <CabeceraPagina
        titulo="Ventas"
        descripcion="Tocá un producto para sumarlo a la venta."
        acciones={caja.data
          ? <Insignia variante="exito">Caja abierta</Insignia>
          : caja.isSuccess && <Insignia variante="aviso">Caja cerrada</Insignia>}
      />

      <div className="pos">
        <section className="pos__catalogo" aria-label="Productos">
          {precios.isPending && <p className="abm-cargando">Cargando productos…</p>}
          {precios.isError && <EstadoVacio icono="cerrar" titulo="No se pudieron cargar los precios" texto={precios.error.message} />}
          {precios.isSuccess && productos.length === 0 && (
            <EstadoVacio icono="catalogo" titulo="No hay precios cargados" texto="Confirmá los precios en Catálogo › Precios." />
          )}
          {productos.map((producto) => (
            <article key={producto.producto} className="pos-producto">
              <header>
                <h2>{producto.nombre}</h2>
                <span className={`pos-producto__stock${producto.stock <= 0 ? ' is-vacio' : ''}`}>
                  {numero(producto.stock)} bandejas
                </span>
              </header>
              <div className="pos-producto__opciones">
                {producto.presentaciones.map((p) => (
                  <div key={p.presentacion} className="pos-opcion-grupo">
                    <button type="button" className="pos-opcion" onClick={() => agregar(producto, p)}
                      aria-label={`Agregar ${producto.nombre}, ${p.presentacion_nombre}, ${moneda(p.precio)}`}>
                      <span>{p.presentacion_nombre} · {contenidoDe(p.bandejas)}</span>
                      <strong>{moneda(p.precio)}</strong>
                    </button>
                    {Number(p.bandejas) < 1 && (
                      // La docena se cobra al precio de la unidad: suma 12 unidades de una vez.
                      <button type="button" className="pos-docena" onClick={() => agregar(producto, p, 12)}
                        aria-label={`Agregar una docena de ${producto.nombre}, ${moneda(p.precio * 12)}`}>
                        + Docena · {moneda(p.precio * 12)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <Panel titulo="Venta en curso" className="pos__ticket">
          {hecha && (
            <p className="pos__hecha" role="status">
              <Icono nombre="ventas" /> Venta Nº {hecha.id_venta} registrada · {moneda(hecha.total)}
              {hecha.modalidad === 'FIADO' && ` · fiado a ${hecha.cliente_nombre}`}
            </p>
          )}

          {lineas.length === 0 ? (
            <p className="suave pos__vacio">Todavía no agregaste productos.</p>
          ) : (
            <ul className="pos-lineas">
              {lineas.map((l) => (
                <li key={l.clave} className="pos-linea">
                  <div>
                    <p className="pos-linea__nombre">{l.nombre}</p>
                    <p className="suave">{moneda(l.precio)} c/u</p>
                    {faltantes.has(l.producto) && (
                      <p className="campo__error">Stock insuficiente: hay {numero(faltantes.get(l.producto))} bandejas.</p>
                    )}
                  </div>
                  <label className="sr-only" htmlFor={`cant-${l.clave}`}>Cantidad de {l.nombre}</label>
                  <input id={`cant-${l.clave}`} className="campo__control pos-linea__cantidad" type="number"
                    inputMode="decimal" min="0" step="any" value={l.cantidad}
                    onChange={(e) => cambiarCantidad(l.clave, Number(e.target.value))} />
                  <strong className="pos-linea__subtotal">{moneda(l.cantidad * l.precio)}</strong>
                  <button type="button" className="btn btn--fantasma pos-linea__quitar" onClick={() => quitar(l.clave)}
                    aria-label={`Quitar ${l.nombre}`}>
                    <Icono nombre="cerrar" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="pos__total"><span>Total</span><strong>{moneda(total)}</strong></div>

          <Opciones etiqueta="Forma de venta" valor={modalidad} alCambiar={setModalidad}
            opciones={[['CONTADO', 'Contado'], ['FIADO', 'Fiado']]} />

          {modalidad === 'CONTADO' ? (
            <>
              <Opciones etiqueta="Medio de pago" valor={medio} alCambiar={setMedio}
                opciones={[['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']]} />
              {medio === 'TRANSFERENCIA' && (
                <Campo etiqueta="Referencia de la transferencia" value={referencia}
                  onChange={(e) => setReferencia(e.target.value)} error={errores.referencia_transferencia}
                  autoComplete="off" placeholder="Últimos números de la operación" />
              )}
              {sinCaja && <p className="campo__error">No hay caja abierta: abrila para cobrar en efectivo.</p>}
            </>
          ) : (
            <ElegirCliente valor={clienteId} alCambiar={setClienteId} error={errores.cliente} />
          )}

          {registrar.isError && !errores.referencia_transferencia && !(modalidad === 'FIADO' && errores.cliente) && (
            <p className="campo__error" role="alert">
              {errores.general || errores.detalles || errores.medio_pago || errores.cliente || registrar.error.message}
            </p>
          )}

          <Boton className="pos__confirmar" disabled={!puedeConfirmar} cargando={registrar.isPending}
            textoCargando="Registrando…" onClick={() => registrar.mutate()}>
            {modalidad === 'FIADO' ? `Registrar fiado · ${moneda(total)}` : `Cobrar ${moneda(total)}`}
          </Boton>
        </Panel>
      </div>

      <VentasDeHoy />
    </>
  )
}

// Botones de opción (Contado/Fiado, Efectivo/Transferencia)
function Opciones({ etiqueta, valor, alCambiar, opciones }) {
  return (
    <fieldset className="pos__opciones">
      <legend className="campo__label">{etiqueta}</legend>
      <div className="segmentado">
        {opciones.map(([v, texto]) => (
          <button key={v} type="button" className="segmentado__opcion" aria-pressed={valor === v} onClick={() => alCambiar(v)}>
            {texto}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

// Fiado: hay que elegir un cliente registrado (no «Consumidor final»).
function ElegirCliente({ valor, alCambiar, error }) {
  const [buscar, setBuscar] = useState('')
  const texto = useDeferredValue(buscar.trim())
  const clientes = useQuery({
    queryKey: ['clientes', 'fiado', texto],
    queryFn: () => api(`/clientes/?estado=ACTIVO&search=${encodeURIComponent(texto)}`),
  })
  const opciones = (clientes.data?.results ?? []).filter((c) => c.id_cliente !== CONSUMIDOR_FINAL_ID)

  return (
    <div className="pos__cliente">
      <Campo etiqueta="Buscar cliente" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)}
        autoComplete="off" placeholder="Nombre o teléfono…" />
      <Campo as="select" etiqueta="Cliente que se lleva fiado" value={valor} onChange={(e) => alCambiar(e.target.value)} error={error}>
        <option value="">Elegí un cliente</option>
        {opciones.map((c) => <option key={c.id_cliente} value={c.id_cliente}>{c.nombre}</option>)}
      </Campo>
    </div>
  )
}

function VentasDeHoy() {
  const ventas = useQuery({ queryKey: ['ventas', 'hoy'], queryFn: () => api(`/ventas/?desde=${hoyISO()}`) })
  const filas = ventas.data?.results ?? []
  return (
    <Panel titulo="Ventas de hoy" className="pos__hoy">
      {filas.length === 0 ? (
        <p className="suave">{ventas.isPending ? 'Cargando…' : 'Todavía no hay ventas hoy.'}</p>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Hora</th><th scope="col">Nº</th><th scope="col">Cliente</th>
                <th scope="col">Forma</th><th scope="col" className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((v) => (
                <tr key={v.id_venta}>
                  <td>{hora(v.fecha)}</td>
                  <td>{v.id_venta}</td>
                  <td>{v.cliente_nombre}</td>
                  <td>
                    {v.modalidad === 'FIADO'
                      ? <Insignia variante="aviso">Fiado</Insignia>
                      : <Insignia variante="neutro">{v.pagos[0]?.medio_pago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}</Insignia>}
                  </td>
                  <td className="num">{moneda(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// [{producto, presentacion, ...}] → [{ producto, nombre, stock, presentaciones: [...] }]
function agruparPorProducto(precios) {
  const porProducto = new Map()
  for (const p of precios) {
    if (!porProducto.has(p.producto)) {
      porProducto.set(p.producto, { producto: p.producto, nombre: p.producto_nombre, stock: Number(p.stock_bandejas), presentaciones: [] })
    }
    porProducto.get(p.producto).presentaciones.push(p)
  }
  return [...porProducto.values()]
}

// Productos cuya venta necesita más bandejas de las que hay → Map(producto → stock disponible)
function sinStock(lineas, productos) {
  const faltan = new Map()
  for (const producto of productos) {
    const necesarias = lineas.filter((l) => l.producto === producto.producto).reduce((s, l) => s + l.cantidad * l.bandejas, 0)
    if (necesarias > producto.stock + 1e-6) faltan.set(producto.producto, producto.stock)
  }
  return faltan
}
