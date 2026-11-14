import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AvisoError from '../components/AvisoError'
import { Boton, EstadoVacio, Insignia } from '../components/ui'
import { api } from '../lib/api'
import { contenidoDe, moneda, numero } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/precios.css'

// Solapa Precios del Catálogo (S5-10 · HU-02-C), pensada para un administrador nuevo:
// 1) cuánto te cuesta cada bandeja, 2) a cuánto lo vendés hoy y cuánto ganás,
// 3) un precio sugerido = lo que te cuesta + la ganancia que elijas.
const MARGEN_GUARDADO = 'marpe.margen'

function leerMargen() {
  try { return Number(localStorage.getItem(MARGEN_GUARDADO)) || 0 } catch { return 0 }
}

// Precio con ganancia, redondeado para arriba a $ 10 (precios fáciles de cobrar).
const conGanancia = (cuesta, margen) => Math.ceil((Number(cuesta) * (1 + margen / 100)) / 10) * 10

export default function Precios() {
  const sugeridos = useQuery({ queryKey: ['precios', 'sugeridos'], queryFn: () => api('/precios/sugeridos/') })
  const { data: usuario } = useSesion()
  const esAdministrador = usuario?.rol === 'Administrador'
  const [margen, setMargen] = useState(leerMargen)

  function cambiarMargen(valor) {
    const numeroMargen = Math.max(0, Number(valor) || 0)
    setMargen(numeroMargen)
    try { localStorage.setItem(MARGEN_GUARDADO, String(numeroMargen)) } catch { /* sin almacenamiento: no pasa nada */ }
  }

  if (sugeridos.isPending) return <p className="abm-cargando">Calculando precios…</p>
  if (sugeridos.isError) {
    return <EstadoVacio icono="cerrar" titulo="No se pudieron calcular los precios" texto={sugeridos.error.message} />
  }

  return (
    <div className="precios">
      <div className="precios__intro">
        <p>
          Para cada producto ves <strong>cuánto te cuesta</strong> (lo que le pagaste al proveedor más los gastos
          fijos del mes), <strong>a cuánto lo vendés hoy</strong> y <strong>cuánto ganás</strong>.
          {!esAdministrador && ' Solo el administrador puede cambiar precios.'}
        </p>
        {esAdministrador && (
          <label className="precios__margen">
            <span>Ganancia que querés sumar</span>
            <span className="precios__margen-campo">
              <input className="campo__control" type="number" inputMode="numeric" min="0" step="1"
                value={margen} onChange={(e) => cambiarMargen(e.target.value)} />
              <span aria-hidden="true">%</span>
            </span>
          </label>
        )}
      </div>

      {sugeridos.data.map((fila) => (
        <ProductoPrecios key={fila.producto} fila={fila} margen={margen} puedeCambiar={esAdministrador} />
      ))}
    </div>
  )
}

function ProductoPrecios({ fila, margen, puedeCambiar }) {
  const { calculo } = fila
  const tituloId = `precio-${fila.producto}`

  return (
    <section className="panel precios__producto" aria-labelledby={tituloId}>
      <header className="precios__cab">
        <h2 id={tituloId}>{fila.producto_nombre}</h2>
        {calculo.error ? (
          <p className="campo__error">{calculo.error}</p>
        ) : (
          <>
            <p className="precios__costo">Cada bandeja te cuesta <strong>{moneda(calculo.equilibrio_bandeja)}</strong></p>
            <p className="precios__detalle">
              {moneda(calculo.costo_bandeja)} que le pagaste al proveedor
              {' + '}{moneda(calculo.gasto_fijo_bandeja)} de gastos fijos
              <span className="suave">
                {' '}(los {moneda(calculo.gastos_fijos_mes)} de alquiler, combustible, etc. de este mes, repartidos entre las{' '}
                {numero(Number(calculo.bandejas_compradas_mes))} bandejas que compraste)
              </span>
            </p>
          </>
        )}
      </header>

      <div className="tabla-wrap">
        <table className="tabla precios__tabla">
          <thead>
            <tr>
              <th scope="col">Presentación</th>
              <th scope="col" className="num">Te cuesta</th>
              <th scope="col" className="num">La vendés a</th>
              <th scope="col" className="num">Ganás</th>
              {puedeCambiar && <th scope="col">Precio nuevo</th>}
            </tr>
          </thead>
          <tbody>
            {fila.presentaciones.map((p) => (
              <tr key={p.presentacion}>
                <td>
                  <strong>{p.presentacion_nombre}</strong>
                  <span className="precios__contenido">{contenidoDe(p.bandejas)}</span>
                </td>
                <td className="num">{p.sugerido ? moneda(p.sugerido) : '—'}</td>
                <td className="num">
                  {p.precio_vigente ? moneda(p.precio_vigente) : <Insignia variante="aviso">Sin precio</Insignia>}
                </td>
                <td className="num"><Ganancia cuesta={p.sugerido} precio={p.precio_vigente} /></td>
                {puedeCambiar && (
                  <td><CambiarPrecio producto={fila.producto} presentacion={p} margen={margen} /></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Ganancia({ cuesta, precio }) {
  if (!cuesta || !precio) return '—'
  const diferencia = Number(precio) - Number(cuesta)
  if (diferencia >= 0) return <span className="ganancia ganancia--si">+{moneda(diferencia)}</span>
  return <span className="ganancia ganancia--no" title="Lo vendés por debajo de lo que te cuesta">Perdés {moneda(-diferencia)}</span>
}

// Campo para el precio nuevo. "Usar sugerido" lo completa con lo que cuesta + la ganancia elegida.
// Si queda por debajo de lo que cuesta, el sistema pide confirmarlo otra vez.
function CambiarPrecio({ producto, presentacion, margen }) {
  const cliente = useQueryClient()
  const [precio, setPrecio] = useState('')
  const sugerido = presentacion.sugerido ? conGanancia(presentacion.sugerido, margen) : null
  const confirmar = useMutation({
    mutationFn: (forzar) => api('/precios/confirmar/', {
      metodo: 'POST',
      datos: { producto, presentacion: presentacion.presentacion, precio, confirmar_bajo_equilibrio: forzar },
    }),
    onSuccess: () => { setPrecio(''); cliente.invalidateQueries({ queryKey: ['precios'] }) },
  })
  const bajoCosto = confirmar.error?.datos?.codigo === 'bajo_equilibrio'
  const campoId = `p-${producto}-${presentacion.presentacion}`

  return (
    <form className="precios__cambiar" onSubmit={(e) => { e.preventDefault(); confirmar.mutate(false) }}>
      <label className="sr-only" htmlFor={campoId}>Precio nuevo de {presentacion.presentacion_nombre}</label>
      <span className="precios__pesos">
        <span aria-hidden="true">$</span>
        <input id={campoId} className="campo__control" type="number" inputMode="decimal" min="0" step="any"
          placeholder={sugerido ? String(sugerido) : ''} value={precio}
          onChange={(e) => { setPrecio(e.target.value); confirmar.reset() }}
          aria-invalid={confirmar.isError || undefined} />
      </span>
      {sugerido && !precio && (
        <Boton variante="fantasma" onClick={() => setPrecio(String(sugerido))}>Usar {moneda(sugerido)}</Boton>
      )}
      {precio && (bajoCosto ? (
        <Boton variante="peligro" cargando={confirmar.isPending} onClick={() => confirmar.mutate(true)}>Guardar igual</Boton>
      ) : (
        <Boton type="submit" variante="secundario" cargando={confirmar.isPending}>Guardar</Boton>
      ))}
      <p className="precios__mensaje" aria-live="polite">
        {bajoCosto && <span className="campo__error">Con ese precio perdés plata: te cuesta {moneda(presentacion.sugerido)}.</span>}
        {confirmar.isSuccess && <span className="precios__ok">Precio guardado. Rige desde hoy.</span>}
      </p>
      {confirmar.isError && !bajoCosto && (
        <AvisoError error={confirmar.error} titulo="No se pudo guardar el precio" alCerrar={() => confirmar.reset()} />
      )}
    </form>
  )
}
