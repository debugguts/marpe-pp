import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AvisoError from '../components/AvisoError'
import Dialogo from '../components/Dialogo'
import Cifra from '../components/Cifra'
import Dona from '../components/Dona'
import Icono from '../components/Icono'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia } from '../components/ui'
import { erroresDe } from '../lib/abm'
import { abrirComprobante, api } from '../lib/api'
import { fecha, hora, hoyISO, moneda, numero } from '../lib/formato'
import { textoMes, ultimoDia, ultimosMeses } from '../lib/meses'
import { useEsAdministrador } from '../lib/sesion'
import '../styles/movimientos.css'

const COLORES_PROVEEDOR = ['var(--cat-sueldos)', 'var(--cat-combustible)', 'var(--cat-servicios)', 'var(--cat-insumos)', 'var(--cat-mantenimiento)', 'var(--cat-otros)']

// Compras a proveedores (S5-13 · HU-04). Al registrar una compra los huevos
// se suman solos al stock, convertidos a bandejas según la presentación.
export default function Compras() {
  const esAdministrador = useEsAdministrador()
  const meses = ultimosMeses()
  const [mes, setMes] = useState(meses[0])
  const [nueva, setNueva] = useState(false)
  const [abierta, setAbierta] = useState(null) // compra que se está mirando
  const [editando, setEditando] = useState(null) // compra que se está modificando
  const [anulando, setAnulando] = useState(null)
  const [proveedor, setProveedor] = useState('')
  const [estado, setEstado] = useState('')
  const proveedores = useProveedores()
  const compras = useQuery({
    queryKey: ['compras', 'mes', mes],
    queryFn: () => api(`/compras/?desde=${mes}-01&hasta=${ultimoDia(mes)}&page_size=500`),
  })
  const delMes = compras.data?.results ?? []
  const filas = delMes.filter((c) => (!proveedor || String(c.proveedor) === proveedor) && (!estado || c.estado === estado))

  // Cifras y gráfico del mes (las anuladas no cuentan)
  const confirmadas = delMes.filter((c) => c.estado !== 'ANULADA')
  const total = confirmadas.reduce((s, c) => s + Number(c.total), 0)
  const bandejas = confirmadas.reduce((s, c) => s + c.detalles.reduce((t, d) => t + Number(d.bandejas ?? 0), 0), 0)
  const porProveedor = new Map()
  for (const c of confirmadas) porProveedor.set(c.proveedor_nombre, (porProveedor.get(c.proveedor_nombre) ?? 0) + Number(c.total))
  const partes = [...porProveedor].sort((a, b) => b[1] - a[1]).map(([nombre, valor], i) => ({ nombre, valor, color: COLORES_PROVEEDOR[i % COLORES_PROVEEDOR.length] }))
  const principal = partes[0]

  return (
    <>
      <CabeceraPagina titulo="Compras" descripcion="Lo que entra al stock, con su comprobante al lado de cada compra."
        acciones={(
          <div className="cab-pagina__acciones">
            <label className="pastilla pastilla--selector">
              <Icono nombre="calendario" tamano={18} />
              <span className="sr-only">Mes</span>
              <select value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => <option key={m} value={m}>{textoMes(m)}</option>)}
              </select>
            </label>
            <Boton icono="mas" onClick={() => setNueva(true)}>Nueva compra</Boton>
          </div>
        )} />

      <div className="cifras">
        <Cifra tono="oscuro" icono="compras" titulo="Compras del mes" valor={moneda(total)}
          insignia={`${confirmadas.length} ${confirmadas.length === 1 ? 'compra confirmada' : 'compras confirmadas'}`} />
        <Cifra tono="salmon" icono="huevo" titulo="Bandejas ingresadas" valor={numero(Math.round(bandejas))}
          nota={`${numero(Math.round(bandejas * 30))} huevos al stock`}
          insignia={bandejas ? `Costo prom. ${moneda(total / bandejas)} la bandeja` : 'Sin compras este mes'} />
        <Cifra tono="arena" icono="proveedores" titulo="Proveedores" valor={`${partes.length} ${partes.length === 1 ? 'activo' : 'activos'}`}
          nota={principal ? `${principal.nombre} es el principal` : 'Todavía no hay compras'}
          insignia={principal && total ? `${Math.round((principal.valor / total) * 100)} % de lo comprado` : '—'} />
      </div>

      <div className="tablero-2">
        <section className="panel compras-lista" aria-label="Compras del mes">
          <div className="filtros">
            {[['', 'Todas'], ['CONFIRMADA', 'Confirmadas'], ['ANULADA', 'Anuladas']].map(([v, t]) => (
              <button key={v} type="button" className="filtro" aria-pressed={estado === v} onClick={() => setEstado(v)}>{t}</button>
            ))}
            <div className="filtros__der">
              <label className="filtro filtro--selector">
                <span className="sr-only">Proveedor</span>
                <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                  <option value="">Todos los proveedores</option>
                  {proveedores.map((p) => <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre}</option>)}
                </select>
              </label>
            </div>
          </div>

          {compras.isPending ? <p className="abm-cargando">Cargando…</p> : filas.length === 0 ? (
            <EstadoVacio icono="compras" titulo={`No hay compras en ${textoMes(mes).toLowerCase()}`} texto="Registrá una compra para sumar huevos al stock." />
          ) : (
            <div className="tabla-wrap">
              <table className="tabla">
                <thead>
                  <tr><th scope="col">Fecha</th><th scope="col">Proveedor</th><th scope="col">Detalle</th><th scope="col" className="num">Total</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {filas.map((c) => (
                    <tr key={c.id_compra} className={`fila-clic${c.estado === 'ANULADA' ? ' is-anulada' : ''}`} tabIndex={0}
                      aria-label={`Ver la compra Nº ${c.id_compra}`} onClick={() => setAbierta(c)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierta(c) } }}>
                      <td>{fecha(c.fecha).slice(0, 5)}</td>
                      <td>
                        <strong>{c.proveedor_nombre}</strong>
                        {c.estado === 'ANULADA'
                          ? <span title={c.motivo_anulacion}><Insignia variante="peligro">Anulada</Insignia></span>
                          : c.fecha_modificacion && <Insignia variante="aviso">Modificada</Insignia>}
                      </td>
                      <td className="detalle-lineas">
                        {c.detalles.map((d) => `${numero(Number(d.cantidad))} ${d.presentacion_nombre} ${d.producto_nombre}`).join(' · ')}
                      </td>
                      <td className="num compra-total-celda">{moneda(c.total)}</td>
                      <td className="compra-acciones" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <button type="button" className="btn btn--fantasma" onClick={() => abrirComprobante('compras', c.id_compra)}
                          aria-label={`Comprobante de la compra ${c.id_compra}`} title="Ver e imprimir el comprobante">
                          <Icono nombre="ventas" /><span>Ticket</span>
                        </button>
                        {esAdministrador && c.estado !== 'ANULADA' && (
                          <>
                            <button type="button" className="btn btn--fantasma" onClick={() => setEditando(c)}
                              aria-label={`Modificar la compra ${c.id_compra}`} title="Modificar">
                              <Icono nombre="editar" />
                            </button>
                            <button type="button" className="btn btn--fantasma compra-acciones__anular" onClick={() => setAnulando(c)}
                              aria-label={`Anular la compra ${c.id_compra}`} title="Anular">
                              <Icono nombre="anular" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="panel compras-lado" aria-labelledby="compras-proveedor">
          <h2 id="compras-proveedor" className="panel__titulo">Compras por proveedor</h2>
          <Dona partes={partes} etiqueta="Compras por proveedor" centro={moneda(total)} nota={textoMes(mes)} />
          <div className="recuadro">
            <span className="recuadro__titulo"><Icono nombre="etiqueta" tamano={17} /> Costo para el precio de venta</span>
            <span>Promedio del mes: <strong>{bandejas ? moneda(total / bandejas) : '—'}</strong> la bandeja</span>
            <span className="recuadro__nota">Lo toma el calculador de precios.</span>
          </div>
        </aside>
      </div>

      {(nueva || editando) && (
        <NuevaCompra proveedores={proveedores} compra={editando} alCerrar={() => { setNueva(false); setEditando(null) }} />
      )}
      {abierta && (
        <VerCompra compra={abierta} esAdministrador={esAdministrador} alCerrar={() => setAbierta(null)}
          alModificar={() => { setEditando(abierta); setAbierta(null) }}
          alAnular={() => { setAnulando(abierta); setAbierta(null) }} />
      )}
      {anulando && <AnularCompra compra={anulando} alCerrar={() => setAnulando(null)} />}
    </>
  )
}

function useProveedores() {
  const consulta = useQuery({ queryKey: ['proveedores', 'activos'], queryFn: () => api('/proveedores/?estado=ACTIVO') })
  return consulta.data?.results ?? []
}

const lineaVacia = () => ({ clave: crypto.randomUUID(), producto: '', presentacion: '', cantidad: '', precio: '' })

// Límites que pidió el cliente para evitar errores de tipeo.
const CANTIDAD_MAX = 100000
const PRECIO_MAX = 100000000
const TECLAS_CANTIDAD = ['-', '+', 'e', 'E', '.', ',']
const TECLAS_PRECIO = ['-', '+', 'e', 'E']
const bloquear = (teclas) => (e) => { if (teclas.includes(e.key)) e.preventDefault() }
const sinRueda = (e) => e.currentTarget.blur() // la rueda del mouse no cambia el número

// Revisa todo el formulario y devuelve los errores por campo y por línea.
function validar({ proveedor, dia, lineas, costoDe }) {
  const general = {}
  if (!proveedor) general.proveedor = 'Elegí el proveedor.'
  if (!dia) general.fecha = 'Indicá la fecha de la compra.'
  else if (dia > hoyISO()) general.fecha = 'La fecha no puede ser posterior a hoy.'

  const vistas = new Set()
  const porLinea = {}
  for (const l of lineas) {
    const e = {}
    if (!l.producto) e.producto = 'Elegí el producto.'
    if (!l.presentacion) e.presentacion = 'Elegí la presentación.'
    if (l.producto && l.presentacion) {
      const combinacion = `${l.producto}-${l.presentacion}`
      if (vistas.has(combinacion)) e.presentacion = 'Ese producto con esa presentación ya está en otra línea: sumá la cantidad ahí.'
      vistas.add(combinacion)
    }
    if (l.cantidad === '') e.cantidad = 'Indicá la cantidad.'
    else if (!/^\d+$/.test(l.cantidad) || Number(l.cantidad) < 1) e.cantidad = 'La cantidad va en números enteros mayores a 0.'
    else if (Number(l.cantidad) > CANTIDAD_MAX) e.cantidad = `La cantidad no puede pasar de ${numero(CANTIDAD_MAX)}.`
    if (l.precio === '') {
      if (proveedor && l.producto && l.presentacion && !costoDe(l)) e.precio = 'Indicá el precio: este proveedor no tiene costo cargado.'
    } else if (!/^\d+(\.\d{1,2})?$/.test(l.precio) || Number(l.precio) <= 0) e.precio = 'El precio tiene que ser mayor a 0 (hasta 2 decimales).'
    else if (Number(l.precio) > PRECIO_MAX) e.precio = `El precio no puede pasar de ${moneda(PRECIO_MAX)}.`
    porLinea[l.clave] = e
  }
  const cantidad = Object.keys(general).length + Object.values(porLinea).reduce((s, e) => s + Object.keys(e).length, 0)
  return { general, porLinea, cantidad }
}

// Una línea del formulario a partir de una línea ya guardada (para modificar).
const lineaDe = (d) => ({
  clave: crypto.randomUUID(), producto: String(d.producto), presentacion: String(d.presentacion),
  cantidad: String(Number(d.cantidad)), precio: String(Number(d.precio_unitario)),
})

// Sirve para cargar una compra nueva o, si recibe «compra», para modificarla.
function NuevaCompra({ proveedores, alCerrar, compra = null }) {
  const cliente = useQueryClient()
  const formulario = useRef(null)
  const [proveedor, setProveedor] = useState(compra ? String(compra.proveedor) : '')
  const [dia, setDia] = useState(compra?.fecha ?? hoyISO())
  const [lineas, setLineas] = useState(compra ? compra.detalles.map(lineaDe) : [lineaVacia()])
  // Si el proveedor de la compra ya no está activo, igual tiene que aparecer para poder modificarla.
  const opcionesProveedor = compra && !proveedores.some((p) => p.id_proveedor === compra.proveedor)
    ? [...proveedores, { id_proveedor: compra.proveedor, nombre: `${compra.proveedor_nombre} (dado de baja)` }]
    : proveedores
  const [intentos, setIntentos] = useState(0) // los errores se muestran recién después del primer intento

  const productos = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => api('/productos/?estado=ACTIVO') }).data?.results ?? []
  const presentaciones = useQuery({ queryKey: ['presentaciones', 'activas'], queryFn: () => api('/presentaciones/?estado=ACTIVO') }).data?.results ?? []
  // Costos vigentes del proveedor elegido: se usan cuando el precio queda vacío.
  const costos = useQuery({
    queryKey: ['costos', proveedor],
    queryFn: () => api(`/costos-proveedor/?proveedor=${proveedor}&vigentes=1`),
    enabled: Boolean(proveedor),
  }).data?.results ?? []
  const costoDe = (l) => costos.find((c) => String(c.producto) === l.producto && String(c.presentacion) === l.presentacion)?.precio_costo
  const precioDe = (l) => Number(l.precio || costoDe(l) || 0)

  const revision = validar({ proveedor, dia, lineas, costoDe })
  const mostrar = intentos > 0
  const lineaValida = (l) => Object.keys(revision.porLinea[l.clave] ?? {}).length === 0
  const validas = lineas.filter(lineaValida)
  const total = validas.reduce((s, l) => s + Number(l.cantidad) * precioDe(l), 0) // nunca negativo

  const guardar = useMutation({
    mutationFn: () => api(compra ? `/compras/${compra.id_compra}/` : '/compras/', {
      metodo: compra ? 'PUT' : 'POST',
      datos: {
        proveedor: Number(proveedor),
        fecha: dia,
        detalles: lineas.map((l) => ({
          producto: Number(l.producto), presentacion: Number(l.presentacion), cantidad: l.cantidad,
          ...(l.precio ? { precio_unitario: l.precio } : {}), // vacío: el servidor usa el costo del proveedor
        })),
      },
    }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['compras'] })
      cliente.invalidateQueries({ queryKey: ['precios'] })
      cliente.invalidateQueries({ queryKey: ['stock'] }) // cambió el stock
      alCerrar()
    },
  })
  const servidor = erroresDe(guardar.error)

  // Después de un intento con errores, el foco va al primer campo marcado en rojo.
  useEffect(() => {
    if (intentos > 0) formulario.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [intentos])

  const cambiar = (clave, campo, valor) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)))
  const errorGeneral = (campo) => (mostrar && revision.general[campo]) || servidor[campo]

  return (
    <Dialogo titulo={compra ? `Modificar la compra Nº ${compra.id_compra}` : 'Nueva compra'}
      descripcion={compra ? 'Al guardar, el stock se ajusta solo.' : 'Si el proveedor tiene costo cargado y dejás el precio vacío, se usa ese costo.'}
      alCerrar={alCerrar}>
      <form ref={formulario} noValidate onSubmit={(e) => {
        e.preventDefault()
        setIntentos((n) => n + 1)
        if (revision.cantidad === 0) guardar.mutate()
      }}>
        <div className="dialogo__cuerpo compra-form">
          {mostrar && revision.cantidad > 0 && (
            <div className="compra-resumen-error" role="alert">
              <Icono nombre="alerta" />
              <span>{revision.cantidad === 1 ? 'Falta corregir 1 dato marcado en rojo.' : `Faltan corregir ${revision.cantidad} datos marcados en rojo.`}</span>
            </div>
          )}

          <div className="fila-2">
            <Campo as="select" etiqueta="Proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} error={errorGeneral('proveedor')} data-foco>
              <option value="">Elegí un proveedor</option>
              {opcionesProveedor.map((p) => <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre}</option>)}
            </Campo>
            <Campo etiqueta="Fecha" type="date" max={hoyISO()} value={dia} onChange={(e) => setDia(e.target.value)} error={errorGeneral('fecha')} />
          </div>

          <fieldset className="lineas">
            <legend className="lineas__titulo">
              <span className="campo__label">Qué compraste</span>
              <span className="lineas__contador">{lineas.length === 1 ? '1 línea' : `${lineas.length} líneas`}</span>
            </legend>

            <div className="linea-compra linea-compra--cabecera" aria-hidden="true">
              <span /><span>Producto</span><span>Presentación</span><span>Cantidad</span><span>Precio c/u</span><span className="num">Subtotal</span><span />
            </div>

            {lineas.map((l, i) => {
              const e = mostrar ? revision.porLinea[l.clave] ?? {} : {}
              const mensajes = [e.producto, e.presentacion, e.cantidad, e.precio].filter(Boolean)
              const idError = `linea-${l.clave}-error`
              const props = (campo) => ({ 'aria-invalid': e[campo] ? 'true' : undefined, 'aria-describedby': e[campo] ? idError : undefined })
              const costo = costoDe(l)
              return (
                <div key={l.clave} className={`linea-compra-bloque${mensajes.length ? ' is-error' : ''}`}>
                  <div className="linea-compra">
                    <span className="linea-compra__num" aria-hidden="true">{i + 1}</span>
                    <select className="campo__control" aria-label={`Producto, línea ${i + 1}`} value={l.producto} {...props('producto')}
                      onChange={(ev) => cambiar(l.clave, 'producto', ev.target.value)}>
                      <option value="">Producto</option>
                      {productos.map((p) => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
                    </select>
                    <select className="campo__control" aria-label={`Presentación, línea ${i + 1}`} value={l.presentacion} {...props('presentacion')}
                      onChange={(ev) => cambiar(l.clave, 'presentacion', ev.target.value)}>
                      <option value="">Presentación</option>
                      {presentaciones.map((p) => <option key={p.id_presentacion} value={p.id_presentacion}>{p.nombre}</option>)}
                    </select>
                    <input className="campo__control num" aria-label={`Cantidad, línea ${i + 1}`} type="number" inputMode="numeric"
                      step="1" min="1" max={CANTIDAD_MAX} placeholder="0" value={l.cantidad} {...props('cantidad')}
                      onKeyDown={bloquear(TECLAS_CANTIDAD)} onWheel={sinRueda}
                      onChange={(ev) => cambiar(l.clave, 'cantidad', ev.target.value)} />
                    <div className="linea-compra__precio">
                      <span aria-hidden="true">$</span>
                      <input className="campo__control num" aria-label={`Precio por unidad, línea ${i + 1}`} type="number" inputMode="decimal"
                        step="0.01" min="0.01" max={PRECIO_MAX} placeholder={costo ? numero(Number(costo)) : '0'} value={l.precio} {...props('precio')}
                        onKeyDown={bloquear(TECLAS_PRECIO)} onWheel={sinRueda}
                        onChange={(ev) => cambiar(l.clave, 'precio', ev.target.value)} />
                    </div>
                    <span className="linea-compra__subtotal num">
                      {lineaValida(l) ? moneda(Number(l.cantidad) * precioDe(l)) : '—'}
                      {!l.precio && costo && <small>costo del proveedor</small>}
                    </span>
                    <button type="button" className="btn btn--fantasma linea-compra__quitar" aria-label={`Quitar línea ${i + 1}`}
                      disabled={lineas.length === 1} onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}>
                      <Icono nombre="cerrar" />
                    </button>
                  </div>
                  {mensajes.length > 0 && (
                    <p id={idError} className="linea-compra__error"><Icono nombre="alerta" />{mensajes.join(' ')}</p>
                  )}
                </div>
              )
            })}
            <button type="button" className="lineas__agregar" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>
              <Icono nombre="mas" /> Agregar otra línea
            </button>
          </fieldset>

          <div className="compra-total">
            <span>
              Total de la compra
              <small>{validas.length === lineas.length ? 'Suma todas las líneas' : `Suma ${validas.length} de ${lineas.length} líneas completas`}</small>
            </span>
            <strong>{moneda(total)}</strong>
          </div>
        </div>
        <footer className="dialogo__pie">
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={guardar.isPending} textoCargando="Guardando…">{compra ? 'Guardar cambios' : 'Registrar compra'}</Boton>
        </footer>
      </form>
      {(servidor.general || servidor.detalles) && <AvisoError error={guardar.error} titulo={compra ? 'No se pudo modificar la compra' : 'No se pudo registrar la compra'} alCerrar={() => guardar.reset()} />}
    </Dialogo>
  )
}

const lineaTexto = (d) => `${numero(Number(d.cantidad))} ${d.presentacion_nombre} ${d.producto_nombre}`
const fechaHora = (iso) => `${fecha(iso)} ${hora(iso)}`

// Detalle de una compra. El administrador puede modificarla o anularla si no está anulada.
function VerCompra({ compra, esAdministrador, alCerrar, alModificar, alAnular }) {
  const anulada = compra.estado === 'ANULADA'
  return (
    <Dialogo titulo={`Compra Nº ${compra.id_compra}`} descripcion={`${compra.proveedor_nombre} · ${fecha(compra.fecha)}`} alCerrar={alCerrar}>
      <div className="dialogo__cuerpo compra-ver">
        {anulada && (
          <div className="compra-resumen-error">
            <Icono nombre="anular" />
            <span>Anulada el {fechaHora(compra.fecha_anulacion)}. Motivo: {compra.motivo_anulacion}</span>
          </div>
        )}
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr><th scope="col">Producto</th><th scope="col" className="num">Cantidad</th><th scope="col" className="num">Precio c/u</th><th scope="col" className="num">Subtotal</th></tr>
            </thead>
            <tbody>
              {compra.detalles.map((d) => (
                <tr key={d.id_detalle_compra}>
                  <td>{d.presentacion_nombre} {d.producto_nombre}</td>
                  <td className="num">{numero(Number(d.cantidad))}</td>
                  <td className="num">{moneda(d.precio_unitario)}</td>
                  <td className="num">{moneda(d.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`compra-total${anulada ? ' is-anulada' : ''}`}>
          <span>Total de la compra</span>
          <strong>{moneda(compra.total)}</strong>
        </div>
        <dl className="compra-datos">
          <div><dt>Cargada por</dt><dd>{compra.usuario_nombre}</dd></div>
          {compra.fecha_modificacion && <div><dt>Modificada</dt><dd>{fechaHora(compra.fecha_modificacion)}</dd></div>}
          {anulada && <div><dt>Anulada</dt><dd>{fechaHora(compra.fecha_anulacion)}</dd></div>}
        </dl>
      </div>
      <footer className="dialogo__pie compra-ver__pie">
        {esAdministrador && !anulada && <Boton variante="peligro" icono="anular" onClick={alAnular}>Anular</Boton>}
        <Boton variante="secundario" icono="compras" onClick={() => abrirComprobante('compras', compra.id_compra)}>Comprobante</Boton>
        <Boton variante="secundario" onClick={alCerrar}>Cerrar</Boton>
        {esAdministrador && !anulada && <Boton icono="editar" onClick={alModificar}>Modificar</Boton>}
      </footer>
    </Dialogo>
  )
}

function AnularCompra({ compra, alCerrar }) {
  const cliente = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const anular = useMutation({
    mutationFn: () => api(`/compras/${compra.id_compra}/anular/`, { metodo: 'POST', datos: { motivo } }),
    onSuccess: () => {
      for (const clave of ['compras', 'precios', 'stock']) cliente.invalidateQueries({ queryKey: [clave] })
      alCerrar()
    },
  })
  const errores = erroresDe(anular.error)
  const general = errores.general || errores.non_field_errors
  const enviar = () => { if (motivo.trim().length >= 3) anular.mutate() }

  return (
    <Dialogo titulo={`Anular la compra Nº ${compra.id_compra}`} descripcion={`${compra.proveedor_nombre} · ${moneda(compra.total)}`} alCerrar={alCerrar}>
      <form className="dialogo__cuerpo compra-form" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <div className="compra-aviso-anular">
          <Icono nombre="alerta" />
          <div>
            <p><strong>Estos huevos salen del stock:</strong></p>
            <ul>{compra.detalles.map((d) => <li key={d.id_detalle_compra}>{lineaTexto(d)}</li>)}</ul>
            <p>La compra no se borra: queda en la lista como anulada. <strong>No se puede deshacer.</strong></p>
          </div>
        </div>
        <Campo etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} error={errores.motivo}
          placeholder="Por ejemplo: se cargó dos veces" maxLength={200} data-foco required />
        {general && (
          <div className="compra-resumen-error" role="alert"><Icono nombre="alerta" /><span>{general}</span></div>
        )}
      </form>
      <footer className="dialogo__pie">
        <Boton variante="secundario" onClick={alCerrar}>Volver</Boton>
        <Boton variante="peligro" cargando={anular.isPending} textoCargando="Anulando…"
          disabled={motivo.trim().length < 3} onClick={enviar}>
          Anular compra
        </Boton>
      </footer>
    </Dialogo>
  )
}
