import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boton, EstadoVacio, Insignia } from '../components/ui'
import { api } from '../lib/api'
import { moneda } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/precios.css'

// Solapa Precios del Catálogo (S5-10 · HU-02-C): el sistema sugiere y el administrador confirma.
// Sugerido = (costo promedio por bandeja + gasto fijo por bandeja) × bandejas de la presentación.
export default function Precios() {
  const sugeridos = useQuery({ queryKey: ['precios', 'sugeridos'], queryFn: () => api('/precios/sugeridos/') })
  const { data: usuario } = useSesion()
  const esAdministrador = usuario?.rol === 'Administrador'

  if (sugeridos.isPending) return <p className="abm-cargando">Calculando precios…</p>
  if (sugeridos.isError) {
    return <EstadoVacio icono="cerrar" titulo="No se pudieron calcular los precios" texto={sugeridos.error.message} />
  }

  return (
    <div className="precios">
      <p className="precios__ayuda suave">
        El precio de <strong>equilibrio</strong> cubre lo que costaron los huevos y los gastos fijos del mes
        (alquiler, combustible…). Todo lo que cobres por encima es ganancia.
        {!esAdministrador && ' Solo el administrador puede confirmar precios nuevos.'}
      </p>
      {sugeridos.data.map((fila) => (
        <ProductoPrecios key={fila.producto} fila={fila} puedeConfirmar={esAdministrador} />
      ))}
    </div>
  )
}

function ProductoPrecios({ fila, puedeConfirmar }) {
  const { calculo } = fila
  return (
    <section className="panel precios__producto" aria-labelledby={`precio-${fila.producto}`}>
      <header className="precios__cab">
        <h2 id={`precio-${fila.producto}`}>{fila.producto_nombre}</h2>
        {calculo.error ? (
          <p className="campo__error">{calculo.error}</p>
        ) : (
          <p className="precios__formula">
            <span>Costo {moneda(calculo.costo_bandeja)}</span>
            <span aria-hidden="true">+</span>
            <span>Gasto fijo {moneda(calculo.gasto_fijo_bandeja)}</span>
            <span aria-hidden="true">=</span>
            <strong>Equilibrio {moneda(calculo.equilibrio_bandeja)} por bandeja</strong>
            <small className="suave">
              Costo según {calculo.origen_costo}. Gastos fijos del mes {moneda(calculo.gastos_fijos_mes)} entre{' '}
              {Number(calculo.bandejas_compradas_mes)} bandejas compradas.
            </small>
          </p>
        )}
      </header>

      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Presentación</th>
              <th scope="col" className="num">Precio actual</th>
              <th scope="col" className="num">Sugerido</th>
              {puedeConfirmar && <th scope="col">Nuevo precio</th>}
            </tr>
          </thead>
          <tbody>
            {fila.presentaciones.map((p) => (
              <tr key={p.presentacion}>
                <td>{p.presentacion_nombre}</td>
                <td className="num">
                  {p.precio_vigente ? moneda(p.precio_vigente) : <Insignia variante="aviso">Sin precio</Insignia>}
                </td>
                <td className="num">{p.sugerido ? moneda(p.sugerido) : '—'}</td>
                {puedeConfirmar && (
                  <td><Confirmar producto={fila.producto} presentacion={p} /></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Campo + botón para confirmar un precio. Si no cubre el equilibrio, pide confirmarlo otra vez.
function Confirmar({ producto, presentacion }) {
  const cliente = useQueryClient()
  const [precio, setPrecio] = useState(presentacion.sugerido ? String(Math.ceil(presentacion.sugerido)) : '')
  const confirmar = useMutation({
    mutationFn: (forzar) => api('/precios/confirmar/', {
      metodo: 'POST',
      datos: { producto, presentacion: presentacion.presentacion, precio, confirmar_bajo_equilibrio: forzar },
    }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['precios'] }),
  })
  const bajoEquilibrio = confirmar.error?.datos?.codigo === 'bajo_equilibrio'
  const etiqueta = `Nuevo precio de ${presentacion.presentacion_nombre}`

  return (
    <form className="precios__confirmar" onSubmit={(e) => { e.preventDefault(); confirmar.mutate(false) }}>
      <label className="sr-only" htmlFor={`p-${producto}-${presentacion.presentacion}`}>{etiqueta}</label>
      <input
        id={`p-${producto}-${presentacion.presentacion}`}
        className="campo__control"
        type="number" inputMode="decimal" min="0" step="any"
        value={precio}
        onChange={(e) => { setPrecio(e.target.value); confirmar.reset() }}
        aria-invalid={confirmar.isError || undefined}
      />
      {bajoEquilibrio ? (
        <Boton variante="peligro" cargando={confirmar.isPending} onClick={() => confirmar.mutate(true)}>
          Confirmar igual
        </Boton>
      ) : (
        <Boton type="submit" variante="secundario" cargando={confirmar.isPending} disabled={!precio}>Confirmar</Boton>
      )}
      <p className="precios__mensaje" aria-live="polite">
        {confirmar.isError && <span className="campo__error">{confirmar.error.datos?.precio ?? confirmar.error.message}</span>}
        {confirmar.isSuccess && (
          <span className="precios__ok">
            Vigente desde hoy
            {confirmar.data.ganancia_estimada && ` · ganancia estimada ${moneda(confirmar.data.ganancia_estimada)}`}
          </span>
        )}
      </p>
    </form>
  )
}
