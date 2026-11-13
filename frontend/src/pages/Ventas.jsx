import { useDeferredValue, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import AvisoError from '../components/AvisoError'
import Dialogo from '../components/Dialogo'
import Icono from '../components/Icono'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { contenidoDe, hora, hoyISO, moneda, numero } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/ventas.css'

// Punto de venta (S5-11 · HU-05). A la izquierda los productos con su precio;
// a la derecha la venta en curso. El total y el control de stock se calculan acá
// para avisar antes de confirmar, pero quien decide es la API (precio vigente y stock real).
// El administrador además puede modificar una venta (se carga en el ticket) o anularla.
// Una venta nunca se borra: anulada, queda en la lista con su motivo.
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
  const [hecha, setHecha] = useState(null) // última venta registrada o modificada
  const [editando, setEditando] = useState(null) // venta que se está modificando (o null si es una venta nueva)
  const [fallo, setFallo] = useState(null) // error de la API para mostrar en la ventana de aviso
  const sesion = useSesion()
  const esAdministrador = sesion.data?.rol === 'Administrador'

  const productos = agruparPorProducto(precios.data ?? [])
  const total = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0)
  // Al modificar, las bandejas que ya tenía la venta vuelven al stock: cuentan como disponibles.
  const reservado = reservadoPor(editando, precios.data ?? [])
  const faltantes = sinStock(lineas, productos, reservado)
  const cobraEfectivo = modalidad === 'CONTADO' && medio === 'EFECTIVO'
  const devuelveEfectivo = editando?.pagos.some((p) => p.medio_pago === 'EFECTIVO')
  const sinCaja = (cobraEfectivo || devuelveEfectivo) && caja.isSuccess && !caja.data

  const registrar = useMutation({
    mutationFn: () => api(editando ? `/ventas/${editando.id_venta}/` : '/ventas/', {
      metodo: editando ? 'PUT' : 'POST',
      datos: {
        modalidad,
        ...(clienteId && { cliente: Number(clienteId) }),
        medio_pago: modalidad === 'CONTADO' ? medio : null,
        referencia_transferencia: referencia,
        detalles: lineas.map((l) => ({ producto: l.producto, presentacion: l.presentacion, cantidad: l.cantidad })),
      },
    }),
    onSuccess: (venta) => {
      setHecha({ ...venta, modificada: Boolean(editando) })
      setEditando(null)
      setLineas([]); setReferencia(''); setClienteId(''); setModalidad('CONTADO')
      // Cambiaron el stock, la caja y las ventas del día: se vuelven a pedir solos.
      cliente.invalidateQueries({ queryKey: ['precios'] })
      cliente.invalidateQueries({ queryKey: ['caja'] })
      cliente.invalidateQueries({ queryKey: ['ventas'] })
    },
    onError: (error) => setFallo(error),
  })
  const errores = erroresDe(registrar.error)

  // Carga una venta ya hecha en el ticket para corregirla.
  function modificar(venta) {
    const bandejasDe = equivalencias(precios.data ?? [])
    setHecha(null); registrar.reset()
    setEditando(venta)
    setLineas(venta.detalles.map((d) => ({
      clave: `${d.producto}-${d.presentacion}`, producto: d.producto, presentacion: d.presentacion,
      nombre: `${d.producto_nombre} · ${d.presentacion_nombre}`,
      precio: Number(d.precio_unitario_aplicado), // la línea que ya estaba conserva su precio
      bandejas: bandejasDe.get(d.presentacion) ?? 1, cantidad: Number(d.cantidad),
    })))
    setModalidad(venta.modalidad)
    setMedio(venta.pagos[0]?.medio_pago ?? 'EFECTIVO')
    setReferencia(venta.pagos[0]?.referencia_transferencia ?? '')
    setClienteId(venta.cliente === CONSUMIDOR_FINAL_ID ? '' : String(venta.cliente))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelarModificacion() {
    setEditando(null); registrar.reset()
    setLineas([]); setReferencia(''); setClienteId(''); setModalidad('CONTADO')
  }

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
        descripcion={editando ? `Modificando la venta Nº ${editando.id_venta}.` : 'Tocá un producto para sumarlo a la venta.'}
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

        <Panel titulo={editando ? `Modificar venta Nº ${editando.id_venta}` : 'Venta en curso'}
          className={`pos__ticket${editando ? ' is-editando' : ''}`}>
          {editando && (
            <div className="pos__editando" role="status">
              <p>Cambiá productos, cantidades o forma de pago y guardá. El sistema devuelve lo anterior al stock y a la caja y vuelve a cargar la venta.</p>
              <Boton variante="secundario" onClick={cancelarModificacion}>Cancelar</Boton>
            </div>
          )}
          {hecha && (
            <p className="pos__hecha" role="status">
              <Icono nombre="ventas" /> Venta Nº {hecha.id_venta} {hecha.modificada ? 'modificada' : 'registrada'} · {moneda(hecha.total)}
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
            </>
          ) : (
            <ElegirCliente valor={clienteId} alCambiar={setClienteId} error={errores.cliente} />
          )}
          {sinCaja && (
            <p className="campo__error">
              No hay caja abierta: abrila para {cobraEfectivo ? 'cobrar' : 'devolver'} en efectivo.
            </p>
          )}

          <Boton className="pos__confirmar" disabled={!puedeConfirmar} cargando={registrar.isPending}
            textoCargando={editando ? 'Guardando…' : 'Registrando…'} onClick={() => registrar.mutate()}>
            {editando
              ? `Guardar cambios · ${moneda(total)}`
              : modalidad === 'FIADO' ? `Registrar fiado · ${moneda(total)}` : `Cobrar ${moneda(total)}`}
          </Boton>
        </Panel>
      </div>

      <ListadoVentas esAdministrador={esAdministrador} editandoId={editando?.id_venta}
        alModificar={modificar} alFallar={setFallo} />

      {fallo && (
        <AvisoError error={fallo} titulo={editando ? 'No se pudo modificar la venta' : 'No se pudo registrar la venta'}
          alCerrar={() => setFallo(null)} />
      )}
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

// Ventas de un día. El administrador puede modificarlas o anularlas; las anuladas quedan a la vista.
function ListadoVentas({ esAdministrador, editandoId, alModificar, alFallar }) {
  const [dia, setDia] = useState(hoyISO())
  const [anulando, setAnulando] = useState(null)
  const ventas = useQuery({
    queryKey: ['ventas', 'dia', dia],
    queryFn: () => api(`/ventas/?desde=${dia}&hasta=${dia}`),
    enabled: Boolean(dia),
  })
  const filas = ventas.data?.results ?? []
  const esHoy = dia === hoyISO()

  return (
    <Panel titulo={esHoy ? 'Ventas de hoy' : 'Ventas del día'} className="pos__hoy"
      accion={<Campo etiqueta="Día" type="date" value={dia} max={hoyISO()} onChange={(e) => setDia(e.target.value)} className="pos__dia" />}>
      {filas.length === 0 ? (
        <p className="suave">{ventas.isPending ? 'Cargando…' : esHoy ? 'Todavía no hay ventas hoy.' : 'No hubo ventas ese día.'}</p>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla tabla-ventas">
            <thead>
              <tr>
                <th scope="col">Hora</th><th scope="col">Nº</th><th scope="col">Cliente</th>
                <th scope="col">Forma</th><th scope="col">Estado</th><th scope="col" className="num">Total</th>
                {esAdministrador && <th scope="col"><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((v) => {
                const anulada = v.estado === 'ANULADA'
                return (
                  <tr key={v.id_venta} className={anulada ? 'is-anulada' : v.id_venta === editandoId ? 'is-editando' : undefined}>
                    <td>{hora(v.fecha)}</td>
                    <td>{v.id_venta}</td>
                    <td>{v.cliente_nombre}</td>
                    <td>
                      {v.modalidad === 'FIADO'
                        ? <Insignia variante="aviso">Fiado</Insignia>
                        : <Insignia variante="neutro">{v.pagos[0]?.medio_pago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}</Insignia>}
                    </td>
                    <td>
                      {anulada
                        ? <span title={v.motivo_anulacion}><Insignia variante="peligro">Anulada</Insignia></span>
                        : v.fecha_modificacion
                          ? <Insignia variante="marca">Modificada</Insignia>
                          : <Insignia variante="exito">Confirmada</Insignia>}
                      {anulada && <p className="suave tabla-ventas__motivo">{v.motivo_anulacion}</p>}
                    </td>
                    <td className="num tabla-ventas__total">{moneda(v.total)}</td>
                    {esAdministrador && (
                      <td className="tabla-ventas__acciones">
                        {!anulada && (
                          <>
                            <button type="button" className="btn btn--fantasma" onClick={() => alModificar(v)}
                              disabled={v.id_venta === editandoId} aria-label={`Modificar la venta ${v.id_venta}`}>
                              <Icono nombre="editar" /><span>Modificar</span>
                            </button>
                            <button type="button" className="btn btn--fantasma tabla-ventas__anular" onClick={() => setAnulando(v)}
                              aria-label={`Anular la venta ${v.id_venta}`}>
                              <Icono nombre="anular" /><span>Anular</span>
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {anulando && <AnularVenta venta={anulando} alCerrar={() => setAnulando(null)} alFallar={alFallar} />}
    </Panel>
  )
}

// Anular en vez de borrar: la venta queda registrada como ANULADA con su motivo,
// y el sistema devuelve el stock y el efectivo.
function AnularVenta({ venta, alCerrar, alFallar }) {
  const cliente = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const anular = useMutation({
    mutationFn: () => api(`/ventas/${venta.id_venta}/anular/`, { metodo: 'POST', datos: { motivo } }),
    onSuccess: () => {
      for (const clave of ['ventas', 'precios', 'caja', 'cuentas-corrientes']) cliente.invalidateQueries({ queryKey: [clave] })
      alCerrar()
    },
    onError: (error) => { if (!erroresDe(error).motivo) { alCerrar(); alFallar(error) } },
  })
  const errores = erroresDe(anular.error)
  const efectivo = venta.pagos.some((p) => p.medio_pago === 'EFECTIVO')

  return (
    <Dialogo titulo={`Anular la venta Nº ${venta.id_venta}`}
      descripcion={`${venta.cliente_nombre} · ${moneda(venta.total)}`} alCerrar={alCerrar}>
      <form className="dialogo__cuerpo" onSubmit={(e) => { e.preventDefault(); anular.mutate() }}>
        <p>
          La venta no se borra: queda en la lista como anulada. Los huevos vuelven al stock
          {efectivo ? ' y el efectivo sale de la caja abierta' : ''}{venta.modalidad === 'FIADO' ? ' y la deuda del cliente se da de baja' : ''}.
        </p>
        <Campo etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} error={errores.motivo}
          placeholder="Por ejemplo: el cliente devolvió la mercadería" maxLength={200} data-foco required />
      </form>
      <footer className="dialogo__pie">
        <Boton variante="secundario" onClick={alCerrar}>Volver</Boton>
        <Boton variante="peligro" cargando={anular.isPending} textoCargando="Anulando…"
          disabled={motivo.trim().length < 3} onClick={() => anular.mutate()}>
          Anular venta
        </Boton>
      </footer>
    </Dialogo>
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

// Presentación → bandejas que equivale (Unidad 0,0333 · Bandeja 1 · Caja 6)
function equivalencias(precios) {
  return new Map(precios.map((p) => [p.presentacion, Number(p.bandejas)]))
}

// Bandejas que tiene tomadas la venta que se está modificando → Map(producto → bandejas)
function reservadoPor(venta, precios) {
  const reservado = new Map()
  if (!venta) return reservado
  const bandejasDe = equivalencias(precios)
  for (const d of venta.detalles) {
    reservado.set(d.producto, (reservado.get(d.producto) ?? 0) + Number(d.cantidad) * (bandejasDe.get(d.presentacion) ?? 1))
  }
  return reservado
}

// Productos cuya venta necesita más bandejas de las que hay → Map(producto → stock disponible)
function sinStock(lineas, productos, reservado = new Map()) {
  const faltan = new Map()
  for (const producto of productos) {
    const disponible = producto.stock + (reservado.get(producto.producto) ?? 0)
    const necesarias = lineas.filter((l) => l.producto === producto.producto).reduce((s, l) => s + l.cantidad * l.bandejas, 0)
    if (necesarias > disponible + 1e-6) faltan.set(producto.producto, disponible)
  }
  return faltan
}
