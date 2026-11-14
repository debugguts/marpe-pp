import { useDeferredValue, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boton, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import AvisoError from '../components/AvisoError'
import Dialogo from '../components/Dialogo'
import Icono from '../components/Icono'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { contenidoDe, hora, hoyISO, moneda, numero } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/ventas.css'

// Punto de venta (S5-11 · HU-05). Rediseño «mostrador»: buscador y filtros por tamaño y color,
// una tarjeta por huevo con sus presentaciones (y huevos sueltos por cantidad), y a la derecha la venta actual con
// el medio de pago en un solo paso. El total y el control de stock se calculan acá para avisar
// antes de confirmar, pero quien decide es la API (precio vigente y stock real).
// El administrador además puede modificar una venta (se carga en el ticket) o anularla.
// Una venta nunca se borra: anulada, queda en la lista con su motivo.
const CONSUMIDOR_FINAL_ID = 1
const TAMANOS = [['', 'Todos'], ['MEDIANO', 'Mediano'], ['SELECCIÓN', 'Selección'], ['SÚPER', 'Súper']]
const COLORES = [['', 'Todos'], ['BLANCO', 'Blanco'], ['CASTAÑO', 'Castaño']]
const PAGOS = [
  ['EFECTIVO', 'Efectivo', 'Entra a la caja', 'caja'],
  ['TRANSFERENCIA', 'Transferencia', 'QR o banco', 'banco'],
  ['FIADO', 'Fiado', 'Cuenta corriente', 'cuentas'],
]
const fechaHoy = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

export default function Ventas() {
  const cliente = useQueryClient()
  const precios = useQuery({ queryKey: ['precios', 'lista'], queryFn: () => api('/precios/') })
  const productosApi = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => api('/productos/?estado=ACTIVO') })
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api('/stock/') })
  const caja = useQuery({ queryKey: ['caja', 'actual'], queryFn: () => api('/cajas/actual/') })

  const [lineas, setLineas] = useState([]) // [{ clave, producto, presentacion, nombre, detalle, precio, bandejas, cantidad }]
  const [pago, setPago] = useState('EFECTIVO') // EFECTIVO · TRANSFERENCIA · FIADO
  const [referencia, setReferencia] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [buscar, setBuscar] = useState('')
  const [tamano, setTamano] = useState('')
  const [color, setColor] = useState('')
  const [hecha, setHecha] = useState(null) // última venta registrada o modificada
  const [editando, setEditando] = useState(null) // venta que se está modificando (o null si es una venta nueva)
  const [fallo, setFallo] = useState(null) // error de la API para mostrar en la ventana de aviso
  const [verLista, setVerLista] = useState(false)
  const sesion = useSesion()
  const esAdministrador = sesion.data?.rol === 'Administrador'

  const modalidad = pago === 'FIADO' ? 'FIADO' : 'CONTADO'
  const productos = agruparPorProducto(precios.data ?? [])
  const tarjetas = armarTarjetas(precios.data ?? [], productosApi.data?.results ?? [], stock.data ?? [])
  const texto = buscar.trim().toLowerCase()
  const visibles = tarjetas.filter((t) => (!tamano || t.tamano === tamano) && (!color || t.color === color)
    && (!texto || `${t.nombre} ${t.presentacion_nombre}`.toLowerCase().includes(texto)))
  // Una tarjeta por huevo; adentro, una fila por presentación (Bandeja, Caja y huevos sueltos).
  const grupos = TAMANOS.slice(1).map(([v, nombre]) => ({ nombre, huevos: porHuevo(visibles.filter((t) => t.tamano === v)) }))
    .filter((g) => g.huevos.length > 0)
  const cantidadHuevos = grupos.reduce((s, g) => s + g.huevos.length, 0)

  const total = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0)
  // Al modificar, las bandejas que ya tenía la venta vuelven al stock: cuentan como disponibles.
  const reservado = reservadoPor(editando, precios.data ?? [])
  const faltantes = sinStock(lineas, productos, reservado)
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
        detalle: t.presentacion_nombre, precio: t.precio, bandejas: t.bandejas, cantidad: cuantas,
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
    setHecha(null); registrar.reset()
    setEditando(venta)
    setLineas(venta.detalles.map((d) => ({
      clave: `${d.producto}-${d.presentacion}`, producto: d.producto, presentacion: d.presentacion,
      nombre: d.producto_nombre, detalle: d.presentacion_nombre,
      precio: Number(d.precio_unitario_aplicado), // la línea que ya estaba conserva su precio
      bandejas: bandejasDe.get(d.presentacion) ?? 1, cantidad: Number(d.cantidad),
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
          : caja.isSuccess && <Insignia variante="aviso">Caja cerrada</Insignia>}
      </header>

      <div className="mostrador__cuerpo">
        <section className="mostrador__catalogo" aria-label="Productos">
          <label className="mostrador__buscar">
            <Icono nombre="buscar" />
            <span className="sr-only">Buscar producto</span>
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto…" autoComplete="off" />
          </label>
          <div className="mostrador__filtros">
            <Chips etiqueta="Tamaño" opciones={TAMANOS} valor={tamano} alCambiar={setTamano} />
            <Chips etiqueta="Color" opciones={COLORES} valor={color} alCambiar={setColor} />
            <span className="mostrador__cuenta">{cantidadHuevos} {cantidadHuevos === 1 ? 'huevo' : 'huevos'}</span>
          </div>

          {precios.isPending && <p className="abm-cargando">Cargando productos…</p>}
          {precios.isError && <EstadoVacio icono="cerrar" titulo="No se pudieron cargar los precios" texto={precios.error.message} />}
          {precios.isSuccess && visibles.length === 0 && (
            <EstadoVacio icono="catalogo" titulo={tarjetas.length ? 'Nada coincide con la búsqueda' : 'No hay precios cargados'}
              texto={tarjetas.length ? 'Probá con otro nombre o sacá los filtros.' : 'Confirmá los precios en Catálogo › Precios.'} />
          )}

          {/* Todos los huevos en una sola grilla, ordenados Mediano → Selección → Súper: así no quedan huecos. */}
          <div className="mostrador__tarjetas">
                {grupos.flatMap((g) => g.huevos).map((h) => (
                  <article key={h.producto} className="tarjeta-huevo">
                    <header>
                      <div className="tarjeta-huevo__chips">
                        <span className="tarjeta-venta__chip">{h.colorTexto}</span>
                        <span className="tarjeta-venta__chip">{h.tamanoTexto}</span>
                      </div>
                      <h3>{h.nombre}</h3>
                      <p className={`tarjeta-huevo__stock is-${h.nivel}`}>
                        {h.nivel === 'agotado' ? 'Sin stock' : `Hay ${h.stockTexto}`}{h.nivel === 'bajo' && ' · reponer'}
                      </p>
                    </header>
                    <ul className="tarjeta-huevo__opciones">
                      {h.opciones.map((t) => (
                        <li key={t.clave}>
                          {t.tipo === 'unidad'
                            ? <HuevosSueltos t={t} alAgregar={(n) => agregar(t, n)} />
                            : (
                              <button type="button" className={`opcion-venta is-${t.tipo}`} onClick={() => agregar(t)} disabled={t.nivel === 'agotado'}
                                aria-label={`Agregar ${t.nombre}, ${t.presentacion_nombre}, ${moneda(t.precio)}`}>
                                <span className="opcion-venta__marca" aria-hidden="true">{t.sigla}</span>
                                <span className="opcion-venta__texto">
                                  <strong>{t.presentacion_nombre}</strong>
                                  <small>{t.contenido} · {t.nivel === 'agotado' ? 'sin stock' : `${t.disponibles} disp.`}</small>
                                </span>
                                <span className="opcion-venta__precio">{moneda(t.precio)}</span>
                                <span className="opcion-venta__mas" aria-hidden="true"><Icono nombre="mas" /></span>
                              </button>
                            )}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
          </div>
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

// Fila de botones para filtrar (Tamaño: Todos · Mediano · Selección · Súper)
function Chips({ etiqueta, opciones, valor, alCambiar }) {
  return (
    <div className="chips" role="group" aria-label={etiqueta}>
      <span className="chips__eti">{etiqueta}</span>
      {opciones.map(([v, texto]) => (
        <button key={v} type="button" className="chip" aria-pressed={valor === v} onClick={() => alCambiar(v)}>{texto}</button>
      ))}
    </div>
  )
}

// Barra de abajo: lo vendido hoy y la última venta. Abre la lista para modificar o anular.
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

// Una opción por producto y presentación. La Unidad se vende como «huevos sueltos»: se escribe cuántos.
// "disponibles" se cuenta en la unidad de cada opción: 24 bandejas = 4 cajas = 720 huevos.
function armarTarjetas(precios, productos, stock) {
  const datos = new Map(productos.map((p) => [p.id_producto, p]))
  const minimos = new Map(stock.map((s) => [s.producto, s]))
  return precios.map((p) => {
    const producto = datos.get(p.producto) ?? {}
    const bandejas = Number(p.bandejas)
    const tipo = bandejas < 1 ? 'unidad' : bandejas >= 6 ? 'caja' : 'bandeja'
    const cantidad = Math.floor(Number(p.stock_bandejas) / bandejas + 1e-6)
    const unidad = { unidad: ['huevo', 'huevos'], caja: ['caja', 'cajas'], bandeja: ['bandeja', 'bandejas'] }[tipo][cantidad === 1 ? 0 : 1]
    return {
      clave: `${p.producto}-${p.presentacion}`, producto: p.producto, presentacion: p.presentacion,
      nombre: p.producto_nombre, presentacion_nombre: tipo === 'unidad' ? 'Huevos sueltos' : p.presentacion_nombre,
      contenido: contenidoDe(bandejas), precio: Number(p.precio), bandejas, tipo, maximo: cantidad,
      color: producto.tipo_huevo, colorTexto: producto.tipo_huevo === 'BLANCO' ? 'Blanco' : 'Castaño',
      tamano: producto.tamano, tamanoTexto: { MEDIANO: 'Mediano', 'SELECCIÓN': 'Selección', 'SÚPER': 'Súper' }[producto.tamano] ?? '',
      disponibles: `${numero(cantidad)} ${unidad}`,
      sigla: tipo === 'unidad' ? '1' : tipo === 'caja' ? `×${numero(bandejas)}` : '30',
      stockBandejas: Number(p.stock_bandejas),
      nivel: cantidad <= 0 ? 'agotado' : minimos.get(p.producto)?.bajo_minimo ? 'bajo' : 'ok',
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre) || orden(a) - orden(b))
}

// Huevos sueltos: se escribe la cantidad (por defecto 12, una docena) y se agrega.
// Botones rápidos para lo más común: media docena, docena y 30.
function HuevosSueltos({ t, alAgregar }) {
  const [cantidad, setCantidad] = useState('12')
  const n = Math.floor(Number(cantidad) || 0)
  const sinStock = t.nivel === 'agotado'
  const enviar = (valor) => { if (valor > 0) alAgregar(valor) }
  return (
    <div className={`opcion-venta is-unidad opcion-venta--sueltos${sinStock ? ' is-apagada' : ''}`}>
      <span className="opcion-venta__marca" aria-hidden="true">{t.sigla}</span>
      <span className="opcion-venta__texto">
        <strong>Huevos sueltos</strong>
        <small>{moneda(t.precio)} el huevo · {sinStock ? 'sin stock' : `${t.disponibles} disp.`}</small>
      </span>
      <form className="sueltos" onSubmit={(e) => { e.preventDefault(); enviar(n) }}>
        <label className="sr-only" htmlFor={`sueltos-${t.clave}`}>Cantidad de huevos de {t.nombre}</label>
        <input id={`sueltos-${t.clave}`} type="number" inputMode="numeric" min="1" max={t.maximo || undefined} step="1"
          value={cantidad} onChange={(e) => setCantidad(e.target.value)} disabled={sinStock} />
        <span className="sueltos__total">{n > 0 ? moneda(n * t.precio) : '—'}</span>
        <button type="submit" className="opcion-venta__mas" disabled={sinStock || n <= 0} aria-label={`Agregar ${n} huevos de ${t.nombre}`}>
          <Icono nombre="mas" />
        </button>
      </form>
      <div className="sueltos__rapidos">
        {[[6, 'Media docena'], [12, 'Docena'], [30, '30']].map(([v, texto]) => (
          <button key={v} type="button" disabled={sinStock} onClick={() => enviar(v)} aria-label={`Agregar ${texto.toLowerCase()} de ${t.nombre}`}>
            + {texto}
          </button>
        ))}
      </div>
    </div>
  )
}

// Agrupa las opciones por huevo: [{ producto, nombre, stockTexto, nivel, opciones: [Bandeja, Caja, Huevos sueltos] }]
function porHuevo(tarjetas) {
  const huevos = new Map()
  for (const t of tarjetas) {
    if (!huevos.has(t.producto)) {
      huevos.set(t.producto, {
        producto: t.producto, nombre: t.nombre, colorTexto: t.colorTexto, tamanoTexto: t.tamanoTexto,
        stockTexto: `${numero(Math.floor(t.stockBandejas * 100) / 100)} bandejas`, opciones: [],
        nivel: t.stockBandejas <= 0 ? 'agotado' : t.nivel === 'bajo' ? 'bajo' : 'ok',
      })
    }
    huevos.get(t.producto).opciones.push(t)
  }
  return [...huevos.values()]
}

// Tipo de presentación de una línea del ticket, para pintarla igual que su botón.
const tipoDe = (l) => (l.bandejas < 1 ? 'unidad' : l.bandejas >= 6 ? 'caja' : 'bandeja')

// Orden dentro de cada huevo: Bandeja, Caja y al final los huevos sueltos.
const orden = (t) => (t.tipo === 'unidad' ? 1000 : t.bandejas)

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
