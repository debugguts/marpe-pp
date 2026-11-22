import { useDeferredValue, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boton, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import AvisoError from '../components/AvisoError'
import Dialogo from '../components/Dialogo'
import Icono from '../components/Icono'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { hora, hoyISO, moneda, numero, ZONA } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/ventas.css'

// Punto de venta (S5-11 · HU-05). Rediseño «mostrador»: buscador y filtros por tamaño y color,
// una tarjeta por huevo con sus presentaciones (y huevos sueltos por cantidad), y a la derecha la venta actual con
// el medio de pago en un solo paso. El total y el control de stock se calculan acá para avisar
// antes de confirmar, pero quien decide es la API (precio vigente y stock real).
// El administrador además puede modificar una venta (se carga en el ticket) o anularla.
// Una venta nunca se borra: anulada, queda en la lista con su motivo.
const CONSUMIDOR_FINAL_ID = 1
const PAGOS = [
  ['EFECTIVO', 'Efectivo', 'Entra a la caja', 'caja'],
  ['TRANSFERENCIA', 'Transferencia', 'QR o banco', 'banco'],
  ['FIADO', 'Fiado', 'Cuenta corriente', 'cuentas'],
]
const fechaHoy = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA })

export default function Ventas() {
  const cliente = useQueryClient()
  const precios = useQuery({ queryKey: ['precios', 'lista'], queryFn: () => api('/precios/') })
  const productosApi = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => api('/productos/?estado=ACTIVO') })
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api('/stock/') })
  const caja = useQuery({ queryKey: ['caja', 'actual'], queryFn: () => api('/cajas/actual/') })
  const presentacionesApi = useQuery({ queryKey: ['presentaciones', 'activas'], queryFn: () => api('/presentaciones/?estado=ACTIVO') })

  const [lineas, setLineas] = useState([]) // [{ clave, producto, presentacion, nombre, detalle, precio, bandejas, cantidad }]
  const [pago, setPago] = useState('EFECTIVO') // EFECTIVO · TRANSFERENCIA · FIADO
  const [referencia, setReferencia] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [buscar, setBuscar] = useState('')
  const [formato, setFormato] = useState('CAJA') // presentación que muestran las dos tarjetas
  const [hecha, setHecha] = useState(null) // última venta registrada o modificada
  const [editando, setEditando] = useState(null) // venta que se está modificando (o null si es una venta nueva)
  const [fallo, setFallo] = useState(null) // error de la API para mostrar en la ventana de aviso
  const [verLista, setVerLista] = useState(false)
  const sesion = useSesion()
  const esAdministrador = sesion.data?.rol === 'Administrador'

  const modalidad = pago === 'FIADO' ? 'FIADO' : 'CONTADO'
  const productos = agruparPorProducto(precios.data ?? [])
  const busqueda = leerBusqueda(buscar)
  const formatoVisto = busqueda.formato ?? formato

  const total = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0)
  // Al modificar, las bandejas que ya tenía la venta vuelven al stock: cuentan como disponibles.
  const reservado = reservadoPor(editando, precios.data ?? [])
  const faltantes = sinStock(lineas, productos, reservado)
  // Bandejas de un huevo que ya ocupa la venta (al modificar, lo que tenía la venta vuelve a quedar libre).
  const bandejasUsadas = (producto) => lineas.filter((l) => l.producto === producto)
    .reduce((suma, l) => suma + l.cantidad * l.bandejas, 0) - (reservado.get(producto) ?? 0)
  const cobraEfectivo = pago === 'EFECTIVO'
  const devuelveEfectivo = editando?.pagos.some((p) => p.medio_pago === 'EFECTIVO')
  const sinCaja = (cobraEfectivo || devuelveEfectivo) && caja.isSuccess && !caja.data

  const registrar = useMutation({
    mutationFn: () => api(editando ? `/ventas/${editando.id_venta}/` : '/ventas/', {
      metodo: editando ? 'PUT' : 'POST',
      datos: {
        modalidad,
        ...(clienteId && { cliente: Number(clienteId) }),
        medio_pago: modalidad === 'CONTADO' ? pago : null,
        referencia_transferencia: referencia,
        detalles: lineas.map((l) => ({ producto: l.producto, presentacion: l.presentacion, cantidad: l.cantidad })),
      },
    }),
    onSuccess: (venta) => {
      setHecha({ ...venta, modificada: Boolean(editando) })
      vaciar()
      // Cambiaron el stock, la caja y las ventas del día: se vuelven a pedir solos.
      for (const clave of ['precios', 'stock', 'caja', 'ventas', 'cuentas-corrientes']) cliente.invalidateQueries({ queryKey: [clave] })
    },
    onError: (error) => setFallo(error),
  })
  const errores = erroresDe(registrar.error)

  // Suma a la venta. Bandeja y Caja de a una; los huevos sueltos, la cantidad que se escriba.
  function agregar(t, cuantas = 1) {
    setHecha(null); registrar.reset()
    setLineas((actuales) => actuales.some((l) => l.clave === t.clave)
      ? actuales.map((l) => (l.clave === t.clave ? { ...l, cantidad: l.cantidad + cuantas } : l))
      : [...actuales, {
        clave: t.clave, producto: t.producto, presentacion: t.presentacion, nombre: t.nombre,
        detalle: t.presentacion_nombre, precio: t.precio, bandejas: t.bandejas, tipo: t.tipo, cantidad: cuantas,
      }])
  }
  const cambiar = (clave, delta) => setLineas((actuales) => actuales
    .map((l) => (l.clave === clave ? { ...l, cantidad: Math.max(0, l.cantidad + delta) } : l))
    .filter((l) => l.cantidad > 0))
  // Cantidad escrita a mano en el ticket (útil para huevos sueltos: 18, 45…). Vacío o 0 no borra la línea.
  const fijar = (clave, valor) => setLineas((actuales) => actuales
    .map((l) => (l.clave === clave ? { ...l, cantidad: Math.max(0, Math.floor(Number(valor) || 0)) } : l)))
  function vaciar() {
    setEditando(null); setLineas([]); setReferencia(''); setClienteId(''); setPago('EFECTIVO')
  }

  // Carga una venta ya hecha en el ticket para corregirla.
  function modificar(venta) {
    const bandejasDe = equivalencias(precios.data ?? [])
    const formatoDe = new Map((presentacionesApi.data?.results ?? []).map((p) => [p.id_presentacion, p.formato]))
    setHecha(null); registrar.reset()
    setEditando(venta)
    setLineas(venta.detalles.map((d) => ({
      clave: `${d.producto}-${d.presentacion}`, producto: d.producto, presentacion: d.presentacion,
      nombre: d.producto_nombre, detalle: d.presentacion_nombre,
      precio: Number(d.precio_unitario_aplicado), // la línea que ya estaba conserva su precio
      bandejas: bandejasDe.get(d.presentacion) ?? 1, tipo: formatoDe.get(d.presentacion)?.toLowerCase(), cantidad: Number(d.cantidad),
    })))
    setPago(venta.modalidad === 'FIADO' ? 'FIADO' : venta.pagos[0]?.medio_pago ?? 'EFECTIVO')
    setReferencia(venta.pagos[0]?.referencia_transferencia ?? '')
    setClienteId(venta.cliente === CONSUMIDOR_FINAL_ID ? '' : String(venta.cliente))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const puedeConfirmar = lineas.length > 0 && faltantes.size === 0 && !sinCaja
    && (pago !== 'FIADO' || clienteId)
    && !(pago === 'TRANSFERENCIA' && !referencia.trim())
  const motivoBloqueo = lineas.length === 0 ? 'Elegí un producto para empezar.'
    : faltantes.size > 0 ? 'Hay productos sin stock suficiente.'
      : sinCaja ? `No hay caja abierta: abrila para ${cobraEfectivo ? 'cobrar' : 'devolver'} en efectivo.`
        : pago === 'FIADO' && !clienteId ? 'Elegí el cliente que se lleva fiado.'
          : pago === 'TRANSFERENCIA' && !referencia.trim() ? 'Anotá la referencia de la transferencia.'
            : pago === 'EFECTIVO' ? 'Cobro listo para recibir en efectivo.'
              : pago === 'TRANSFERENCIA' ? 'La transferencia no pasa por la caja.' : 'La deuda queda en la cuenta corriente del cliente.'

  return (
    <div className="mostrador">
      <header className="mostrador__cab">
        <div>
          <p className="mostrador__fecha">{fechaHoy.format(new Date())}</p>
          <h1>Ventas <span>· {editando ? `Modificando Nº ${editando.id_venta}` : 'Mostrador'}</span></h1>
        </div>
        {caja.data
          ? <Insignia variante="exito">Caja abierta</Insignia>
          : caja.isSuccess && <Insignia variante="peligro">Caja cerrada</Insignia>}
      </header>

      <div className="mostrador__cuerpo">
        <section className="mostrador__catalogo" aria-label="Productos">
          <label className="mostrador__buscar">
            <Icono nombre="buscar" />
            <span className="sr-only">Buscar producto</span>
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto…" autoComplete="off" />
          </label>
          <div className="mostrador__presentacion" role="radiogroup" aria-label="Presentación">
            <span className="mostrador__presentacion-eti">Presentación</span>
            {PRESENTACIONES_MOSTRADOR.map(([v, texto]) => (
              <button key={v} type="button" role="radio" aria-checked={formatoVisto === v} className="mostrador__pildora"
                onClick={() => { setFormato(v); if (busqueda.formato) setBuscar('') }}>{texto}</button>
            ))}
          </div>

          {(precios.isPending || presentacionesApi.isPending) && <p className="abm-cargando">Cargando productos…</p>}
          {precios.isError && <EstadoVacio icono="cerrar" titulo="No se pudieron cargar los precios" texto={precios.error.message} />}

          {precios.isSuccess && presentacionesApi.isSuccess && (
            <div className="mostrador__colores">
              {COLORES_MOSTRADOR.map((c) => (
                <TarjetaColor key={c[0]} color={c} formato={formatoVisto} tamanoBuscado={busqueda.tamano}
                  productos={productosApi.data?.results ?? []} presentaciones={presentacionesApi.data?.results ?? []}
                  precios={precios.data ?? []} stock={stock.data ?? []} bandejasUsadas={bandejasUsadas} alAgregar={agregar} />
              ))}
            </div>
          )}
        </section>

        <aside className={`venta-actual${editando ? ' is-editando' : ''}`} aria-label="Venta actual">
          <p className="venta-actual__eti">{editando ? `Modificando la venta Nº ${editando.id_venta}` : 'Venta actual'}</p>
          <h2>{editando ? 'Corregir venta' : 'Tu venta'}</h2>
          {editando && (
            <p className="venta-actual__aviso">
              Cambiá productos, cantidades o forma de pago y guardá. Lo anterior vuelve al stock y a la caja.
            </p>
          )}
          {hecha && (
            <p className="pos__hecha" role="status">
              <Icono nombre="ventas" /> Venta Nº {hecha.id_venta} {hecha.modificada ? 'modificada' : 'registrada'} · {moneda(hecha.total)}
              {hecha.modalidad === 'FIADO' && ` · fiado a ${hecha.cliente_nombre}`}
            </p>
          )}

          {lineas.length === 0 ? (
            <div className="venta-actual__vacia">
              <span><Icono nombre="ventas" tamano={26} /></span>
              <strong>La venta está vacía</strong>
              <p className="suave">Elegí un producto para empezar.</p>
            </div>
          ) : (
            <ul className="venta-actual__lineas">
              {lineas.map((l) => (
                <li key={l.clave}>
                  <div>
                    <p className="venta-actual__nombre"><span className={`etiqueta-pres is-${tipoDe(l)}`}>{l.detalle}</span>{l.nombre}</p>
                    <p className="suave">{moneda(l.precio)} {tipoDe(l) === 'unidad' ? 'el huevo' : 'c/u'}</p>
                    {faltantes.has(l.producto) && <p className="campo__error">Stock insuficiente: hay {numero(faltantes.get(l.producto))} bandejas.</p>}
                  </div>
                  <div className="paso-a-paso" role="group" aria-label={`Cantidad de ${l.nombre}`}>
                    <button type="button" onClick={() => cambiar(l.clave, -1)} aria-label="Uno menos">−</button>
                    <input type="number" inputMode="numeric" min="1" step="1" value={l.cantidad || ''}
                      onChange={(e) => fijar(l.clave, e.target.value)} onBlur={() => l.cantidad || cambiar(l.clave, 0)}
                      aria-label={`Cantidad de ${l.detalle.toLowerCase()} de ${l.nombre}`} />
                    <button type="button" onClick={() => cambiar(l.clave, 1)} aria-label="Uno más">+</button>
                  </div>
                  <strong className="venta-actual__subtotal">{moneda(l.cantidad * l.precio)}</strong>
                </li>
              ))}
            </ul>
          )}

          <div className="venta-actual__total"><span>Total a cobrar</span><strong>{moneda(total)}</strong></div>

          <fieldset className="venta-actual__pagos">
            <legend>¿Cómo paga?</legend>
            {PAGOS.map(([valor, texto, ayuda, icono]) => (
              <button key={valor} type="button" aria-pressed={pago === valor} onClick={() => setPago(valor)}>
                <Icono nombre={icono} />
                <strong>{texto}</strong>
                <small>{ayuda}</small>
              </button>
            ))}
          </fieldset>

          {pago === 'TRANSFERENCIA' && (
            <Campo etiqueta="Referencia de la transferencia" value={referencia} onChange={(e) => setReferencia(e.target.value)}
              error={errores.referencia_transferencia} autoComplete="off" placeholder="Últimos números de la operación" />
          )}
          {pago === 'FIADO' && <ElegirCliente valor={clienteId} alCambiar={setClienteId} error={errores.cliente} />}

          <Boton className="venta-actual__cobrar" disabled={!puedeConfirmar} cargando={registrar.isPending}
            textoCargando={editando ? 'Guardando…' : 'Registrando…'} onClick={() => registrar.mutate()}>
            {editando ? `Guardar cambios · ${moneda(total)}` : pago === 'FIADO' ? `Registrar fiado · ${moneda(total)}` : `Cobrar venta · ${moneda(total)}`}
          </Boton>
          <Boton variante="secundario" className="venta-actual__vaciar" disabled={lineas.length === 0 && !editando} onClick={vaciar}>
            {editando ? 'Cancelar modificación' : 'Vaciar venta'}
          </Boton>
          <p className={`venta-actual__nota${sinCaja || faltantes.size ? ' is-error' : ''}`}>{motivoBloqueo}</p>
        </aside>
      </div>

      <ResumenDelDia abierto={verLista} alAlternar={() => setVerLista((v) => !v)} />
      {verLista && (
        <ListadoVentas esAdministrador={esAdministrador} editandoId={editando?.id_venta}
          alModificar={modificar} alFallar={setFallo} />
      )}

      {fallo && (
        <AvisoError error={fallo} titulo={editando ? 'No se pudo modificar la venta' : 'No se pudo registrar la venta'}
          alCerrar={() => setFallo(null)} />
      )}
    </div>
  )
}

function ResumenDelDia({ abierto, alAlternar }) {
  const ventas = useQuery({ queryKey: ['ventas', 'dia', hoyISO()], queryFn: () => api(`/ventas/?desde=${hoyISO()}&hasta=${hoyISO()}`) })
  const filas = (ventas.data?.results ?? []).filter((v) => v.estado !== 'ANULADA')
  const vendido = filas.reduce((s, v) => s + Number(v.total), 0)
  const ultima = filas[0]
  return (
    <div className="resumen-dia">
      <span className="resumen-dia__icono"><Icono nombre="cuentas" /></span>
      <div><small>Hoy</small><strong>{filas.length} {filas.length === 1 ? 'venta' : 'ventas'}</strong></div>
      <div><small>Vendido</small><strong>{moneda(vendido)}</strong></div>
      {ultima && <p className="suave resumen-dia__ultima">Última venta Nº {ultima.id_venta} · {hora(ultima.fecha)} · {moneda(ultima.total)}</p>}
      <Boton variante="secundario" onClick={alAlternar}>{abierto ? 'Ocultar ventas del día' : 'Ver ventas del día'}</Boton>
    </div>
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

// Tipo de presentación de una línea del ticket, para pintarla igual que su botón.
const tipoDe = (l) => l.tipo ?? (l.bandejas < 1 ? 'unidad' : l.bandejas >= 6 ? 'caja' : 'bandeja')

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

// ---------- Mostrador por presentación (Caja · Bandeja · Unidad) y una tarjeta por color ----------
const PRESENTACIONES_MOSTRADOR = [['CAJA', 'Caja'], ['BANDEJA', 'Bandeja'], ['UNIDAD', 'Unidad']]
const TAMANOS_MOSTRADOR = [['SELECCIÓN', 'Selección'], ['MEDIANO', 'Mediano'], ['SÚPER', 'Súper']]
const COLORES_MOSTRADOR = [['BLANCO', 'Blanco', 'blanco'], ['CASTAÑO', 'Castaño', 'castano']]
const UNIDADES_STOCK = { CAJA: ['caja', 'cajas'], BANDEJA: ['bandeja', 'bandejas'], UNIDAD: ['unidad', 'unidades'] }
const huevosDe = (bandejas) => Math.round(Number(bandejas) * 30) // la equivalencia está en bandejas de 30
const sinLetras = (e) => { if (['-', '+', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault() }

// Lo que se escribe en el buscador: un tamaño o una presentación cambia lo que muestran las tarjetas.
function leerBusqueda(texto) {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return {
    tamano: /super/.test(t) ? 'SÚPER' : /selec/.test(t) ? 'SELECCIÓN' : /median/.test(t) ? 'MEDIANO' : null,
    formato: /caj|cajon/.test(t) ? 'CAJA' : /bandej|maple/.test(t) ? 'BANDEJA' : /unidad|suelt/.test(t) ? 'UNIDAD' : null,
  }
}

// Qué presentación corresponde: el Súper va en bandejas de 20 o 30 y en cajas de 9 bandejas de 20.
function presentacionPara(presentaciones, formato, tamano, variante) {
  const del = (huevos) => presentaciones.find((p) => p.formato === formato && Number(p.huevos_por_bandeja) === huevos)
  if (formato === 'UNIDAD') return presentaciones.find((p) => p.formato === 'UNIDAD')
  if (formato === 'BANDEJA') return del(tamano === 'SÚPER' ? Number(variante) : 30)
  return tamano === 'SÚPER' ? del(20) ?? del(30) : del(30)
}

function TarjetaColor({ color, formato, tamanoBuscado, productos, presentaciones, precios, stock, bandejasUsadas, alAgregar }) {
  const [nombreColor, textoColor, slug] = color
  const [tamanoPropio, setTamano] = useState('MEDIANO')
  const [variante, setVariante] = useState('30') // solo Súper en bandeja: 20 o 30 huevos
  const [cantidad, setCantidad] = useState('1')
  const tamano = tamanoBuscado ?? tamanoPropio

  const producto = productos.find((p) => p.tipo_huevo === nombreColor && p.tamano === tamano)
  const pres = presentacionPara(presentaciones, formato, tamano, variante)
  const precio = producto && pres && precios.find((p) => p.producto === producto.id_producto && p.presentacion === pres.id_presentacion)
  const fila = producto && stock.find((s) => s.producto === producto.id_producto)
  const huevosPres = pres ? huevosDe(pres.cantidad_bandejas_equivalentes) : 0
  // Lo que ya está en la venta no se puede volver a ofrecer.
  const huevosLibres = Math.max(0, huevosDe(Number(fila?.cantidad_bandejas ?? 0) - (producto ? bandejasUsadas(producto.id_producto) : 0)))
  const disponibles = huevosPres ? Math.floor(huevosLibres / huevosPres) : 0
  const estado = !producto || !pres ? 'nodisp' : !precio ? 'sinprecio' : disponibles <= 0 ? 'agotado' : fila?.bajo_minimo ? 'bajo' : 'ok'
  const bloqueada = ['nodisp', 'sinprecio', 'agotado'].includes(estado)

  const n = bloqueada ? 0 : Math.min(disponibles, Math.max(1, Math.floor(Number(cantidad) || 0)))
  const fijar = (valor) => setCantidad(String(Math.min(disponibles, Math.max(1, valor))))
  const unidad = UNIDADES_STOCK[formato][disponibles === 1 ? 0 : 1]
  const textoTamano = TAMANOS_MOSTRADOR.find(([v]) => v === tamano)?.[1] ?? ''
  const titulo = `${textoColor} ${textoTamano}`
  const huevosBandeja = Number(pres?.huevos_por_bandeja ?? 30)
  const imagen = formato === 'UNIDAD' ? `/presentaciones/unidad-${slug}.webp` : `/presentaciones/${formato.toLowerCase()}-${slug}-${huevosBandeja}.webp`

  const insignia = {
    ok: ['exito', `Stock: ${numero(disponibles)} ${unidad}`],
    bajo: ['aviso', `Poco stock: ${numero(disponibles)} ${unidad}`],
    agotado: ['peligro', 'Sin stock'],
    sinprecio: ['aviso', 'Sin precio: confirmalo en Precios'],
    nodisp: ['peligro', 'No está en el catálogo'],
  }[estado]

  function anadir() {
    if (bloqueada || n <= 0) return
    alAgregar({
      clave: `${producto.id_producto}-${pres.id_presentacion}`, producto: producto.id_producto, presentacion: pres.id_presentacion,
      nombre: titulo, presentacion_nombre: formato === 'UNIDAD' ? 'Huevos sueltos' : pres.nombre,
      precio: Number(precio.precio), bandejas: Number(pres.cantidad_bandejas_equivalentes), tipo: formato.toLowerCase(),
    }, n)
    setCantidad('1')
  }

  return (
    <article className={`tarjeta-color${bloqueada ? ' is-apagada' : ''}`} aria-label={titulo}>
      <h3>{titulo.toUpperCase()}</h3>
      <div className="tarjeta-color__sub">
        {formato === 'CAJA' && `Caja · ${numero(huevosPres / huevosBandeja)} bandejas (${numero(huevosPres)} huevos)`}
        {formato === 'UNIDAD' && 'Venta por unidad · Huevos sueltos'}
        {formato === 'BANDEJA' && tamano !== 'SÚPER' && 'Bandeja · 30 unidades'}
        {formato === 'BANDEJA' && tamano === 'SÚPER' && (
          <>
            <span>Bandeja ·</span>
            <span className="tarjeta-color__variantes" role="group" aria-label="Huevos por bandeja">
              {['20', '30'].map((v) => (
                <button key={v} type="button" aria-pressed={variante === v} onClick={() => setVariante(v)}>{v} Unidades</button>
              ))}
            </span>
          </>
        )}
      </div>
      <p><Insignia variante={insignia[0]}>{insignia[1]}</Insignia></p>

      <div className="tarjeta-color__imagen">
        <img src={imagen} alt={`${titulo} en ${formato === 'UNIDAD' ? 'huevos sueltos' : `${formato.toLowerCase()} de ${huevosBandeja}`}`} loading="lazy" />
      </div>

      <div className="tarjeta-color__tamanos" role="group" aria-label={`Tamaño del huevo ${textoColor.toLowerCase()}`}>
        {TAMANOS_MOSTRADOR.map(([v, texto]) => (
          <button key={v} type="button" aria-pressed={tamano === v} onClick={() => setTamano(v)}>{texto}</button>
        ))}
      </div>

      <div className="tarjeta-color__precio">
        <strong>{precio ? moneda(Number(precio.precio)) : '—'}{formato === 'UNIDAD' && precio && <small> c/u</small>}</strong>
        {formato === 'UNIDAD' && (
          <span className="tarjeta-color__atajos">
            {[[6, 'Media docena'], [12, 'Docena']].map(([v, texto]) => (
              <button key={v} type="button" disabled={bloqueada} onClick={() => fijar(v)}>{texto}</button>
            ))}
          </span>
        )}
      </div>

      <div className="tarjeta-color__accion">
        <div className="paso-a-paso" role="group" aria-label={`Cantidad de ${titulo}`}>
          <button type="button" disabled={bloqueada || n <= 1} onClick={() => fijar(n - 1)} aria-label="Uno menos">−</button>
          <input type="number" inputMode="numeric" min="1" max={disponibles || undefined} step="1" value={bloqueada ? 0 : cantidad}
            disabled={bloqueada} onKeyDown={sinLetras} onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => setCantidad(e.target.value)} onBlur={() => !bloqueada && fijar(n)} aria-label={`Cantidad de ${titulo}`} />
          <button type="button" disabled={bloqueada || n >= disponibles} onClick={() => fijar(n + 1)} aria-label="Uno más">+</button>
        </div>
        <button type="button" className="btn btn--primario tarjeta-color__anadir" disabled={bloqueada} onClick={anadir}>
          <Icono nombre="mas" /><span>Añadir</span>
        </button>
      </div>
    </article>
  )
}
