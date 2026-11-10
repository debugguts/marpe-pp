import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Dialogo from '../components/Dialogo'
import Icono from '../components/Icono'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Panel } from '../components/ui'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { fecha, hoyISO, moneda, numero } from '../lib/formato'
import '../styles/movimientos.css'

// Compras a proveedores (S5-13 · HU-04). Al registrar una compra los huevos
// se suman solos al stock, convertidos a bandejas según la presentación.
export default function Compras() {
  const [nueva, setNueva] = useState(false)
  const [proveedor, setProveedor] = useState('')
  const proveedores = useProveedores()
  const compras = useQuery({
    queryKey: ['compras', proveedor],
    queryFn: () => api(`/compras/${proveedor ? `?proveedor=${proveedor}` : ''}`),
  })
  const filas = compras.data?.results ?? []

  return (
    <>
      <CabeceraPagina titulo="Compras" descripcion="Lo que le comprás a cada proveedor. Suma al stock automáticamente."
        acciones={<Boton icono="mas" onClick={() => setNueva(true)}>Nueva compra</Boton>} />

      <div className="abm-barra">
        <label className="abm-filtro">
          <span className="sr-only">Proveedor</span>
          <select className="campo__control" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre}</option>)}
          </select>
        </label>
      </div>

      {compras.isPending ? <p className="abm-cargando">Cargando…</p> : filas.length === 0 ? (
        <EstadoVacio icono="compras" titulo="Todavía no hay compras" texto="Registrá la primera para sumar huevos al stock." />
      ) : (
        <Panel>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr><th scope="col">Fecha</th><th scope="col">Proveedor</th><th scope="col">Detalle</th><th scope="col" className="num">Total</th></tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id_compra}>
                    <td>{fecha(c.fecha)}</td>
                    <td><strong>{c.proveedor_nombre}</strong></td>
                    <td className="detalle-lineas">
                      {c.detalles.map((d) => `${numero(Number(d.cantidad))} ${d.presentacion_nombre} ${d.producto_nombre}`).join(' · ')}
                    </td>
                    <td className="num">{moneda(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {nueva && <NuevaCompra proveedores={proveedores} alCerrar={() => setNueva(false)} />}
    </>
  )
}

function useProveedores() {
  const consulta = useQuery({ queryKey: ['proveedores', 'activos'], queryFn: () => api('/proveedores/?estado=ACTIVO') })
  return consulta.data?.results ?? []
}

const lineaVacia = () => ({ clave: crypto.randomUUID(), producto: '', presentacion: '', cantidad: '', precio: '' })

function NuevaCompra({ proveedores, alCerrar }) {
  const cliente = useQueryClient()
  const [proveedor, setProveedor] = useState('')
  const [dia, setDia] = useState(hoyISO())
  const [lineas, setLineas] = useState([lineaVacia()])

  const productos = useQuery({ queryKey: ['productos', 'activos'], queryFn: () => api('/productos/?estado=ACTIVO') }).data?.results ?? []
  const presentaciones = useQuery({ queryKey: ['presentaciones', 'activas'], queryFn: () => api('/presentaciones/?estado=ACTIVO') }).data?.results ?? []
  // Costos vigentes del proveedor elegido: se usan para completar el precio solo.
  const costos = useQuery({
    queryKey: ['costos', proveedor],
    queryFn: () => api(`/costos-proveedor/?proveedor=${proveedor}&vigentes=1`),
    enabled: Boolean(proveedor),
  }).data?.results ?? []
  const costoDe = (l) => costos.find((c) => String(c.producto) === l.producto && String(c.presentacion) === l.presentacion)?.precio_costo

  const guardar = useMutation({
    mutationFn: () => api('/compras/', {
      metodo: 'POST',
      datos: {
        proveedor: proveedor ? Number(proveedor) : null,
        fecha: dia,
        detalles: lineas.map((l) => ({
          producto: Number(l.producto) || null, presentacion: Number(l.presentacion) || null,
          cantidad: l.cantidad, ...(l.precio || costoDe(l) ? { precio_unitario: l.precio || costoDe(l) } : {}),
        })),
      },
    }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['compras'] })
      cliente.invalidateQueries({ queryKey: ['precios'] }) // cambió el stock
      alCerrar()
    },
  })
  const [aviso, setAviso] = useState('')
  const errores = erroresDe(guardar.error)
  const cambiar = (clave, campo, valor) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)))
  const total = lineas.reduce((s, l) => s + Number(l.cantidad || 0) * Number(l.precio || costoDe(l) || 0), 0)

  return (
    <Dialogo titulo="Nueva compra" descripcion="Si el proveedor tiene costo cargado, el precio se completa solo." alCerrar={alCerrar}>
      <form onSubmit={(e) => {
        e.preventDefault()
        const incompleta = lineas.some((l) => !l.producto || !l.presentacion || !(Number(l.cantidad) > 0))
        setAviso(incompleta ? 'Completá producto, presentación y una cantidad mayor a 0 en cada línea.' : '')
        if (!incompleta) guardar.mutate()
      }} noValidate>
        <div className="dialogo__cuerpo">
          <div className="fila-2">
            <Campo as="select" etiqueta="Proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} error={errores.proveedor} data-foco>
              <option value="">Elegí un proveedor</option>
              {proveedores.map((p) => <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre}</option>)}
            </Campo>
            <Campo etiqueta="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} error={errores.fecha} />
          </div>

          <fieldset className="lineas">
            <legend className="campo__label">Qué compraste</legend>
            {lineas.map((l, i) => (
              <div key={l.clave} className="linea-compra">
                <select className="campo__control" aria-label={`Producto, línea ${i + 1}`} value={l.producto} onChange={(e) => cambiar(l.clave, 'producto', e.target.value)}>
                  <option value="">Producto</option>
                  {productos.map((p) => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
                </select>
                <select className="campo__control" aria-label={`Presentación, línea ${i + 1}`} value={l.presentacion} onChange={(e) => cambiar(l.clave, 'presentacion', e.target.value)}>
                  <option value="">Presentación</option>
                  {presentaciones.map((p) => <option key={p.id_presentacion} value={p.id_presentacion}>{p.nombre}</option>)}
                </select>
                <input className="campo__control" aria-label={`Cantidad, línea ${i + 1}`} type="number" inputMode="decimal" min="0" step="any"
                  placeholder="Cant." value={l.cantidad} onChange={(e) => cambiar(l.clave, 'cantidad', e.target.value)} />
                <input className="campo__control" aria-label={`Precio por unidad, línea ${i + 1}`} type="number" inputMode="decimal" min="0" step="any"
                  placeholder={costoDe(l) ? `$ ${Number(costoDe(l))}` : 'Precio c/u'} value={l.precio} onChange={(e) => cambiar(l.clave, 'precio', e.target.value)} />
                <button type="button" className="btn btn--fantasma linea-compra__quitar" aria-label={`Quitar línea ${i + 1}`}
                  disabled={lineas.length === 1} onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}>
                  <Icono nombre="cerrar" />
                </button>
              </div>
            ))}
            <Boton variante="fantasma" icono="mas" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>Agregar otra línea</Boton>
          </fieldset>

          {(aviso || errores.detalles || errores.general) && (
            <p className="campo__error" role="alert">{aviso || errores.detalles || errores.general}</p>
          )}
          <p className="total-dialogo"><span>Total</span><strong>{moneda(total)}</strong></p>
        </div>
        <footer className="dialogo__pie">
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={guardar.isPending} textoCargando="Guardando…">Registrar compra</Boton>
        </footer>
      </form>
    </Dialogo>
  )
}

