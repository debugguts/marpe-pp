import { useDeferredValue, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Cifra from '../components/Cifra'
import Dialogo from '../components/Dialogo'
import Dona from '../components/Dona'
import FormularioABM from '../components/FormularioABM'
import Icono from '../components/Icono'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia } from '../components/ui'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { CATEGORIAS_GASTO, categoriaDe } from '../lib/categoriasGasto'
import { fecha, hoyISO, moneda } from '../lib/formato'
import { textoMes, ultimoDia, ultimosMeses } from '../lib/meses'
import { useEsAdministrador } from '../lib/sesion'
import '../styles/movimientos.css'

// Gastos del negocio (S5-13 · HU-09), con el rediseño del cliente (S13): el mes elegido arriba filtra
// las tres cifras, la tabla y el gráfico; los FIJOS se usan para calcular el precio de venta;
// en efectivo salen de la caja abierta (si está cerrada, solo se puede cargar por transferencia).
const IMPORTE_MAX = 100000000
// Revisa el formulario antes de mandarlo (los mismos controles hace la API).
function validarGasto(d, caja) {
  const e = {}
  if (!d.concepto?.trim()) e.concepto = 'Escribí el concepto.'
  else if (d.concepto.trim().length < 3) e.concepto = 'El concepto tiene que tener al menos 3 letras.'
  if (!d.categoria?.trim()) e.categoria = 'Elegí la categoría.'
  if (!d.fecha) e.fecha = 'Indicá la fecha del gasto.'
  else if (d.fecha > hoyISO()) e.fecha = 'La fecha no puede ser posterior a hoy.'
  if ('importe' in d) {
    if (d.importe === '') e.importe = 'Indicá el importe.'
    else if (!/^\d+(\.\d{1,2})?$/.test(d.importe) || Number(d.importe) <= 0) e.importe = 'El importe tiene que ser mayor a 0 (hasta 2 decimales).'
    else if (Number(d.importe) > IMPORTE_MAX) e.importe = 'El importe no puede pasar de $ 100.000.000.'
    else if (d.medio_pago === 'EFECTIVO' && caja && Number(d.importe) > Number(caja.saldo_actual)) {
      e.importe = `No alcanza el efectivo de la caja: hay ${moneda(caja.saldo_actual)}.`
    }
  }
  if (d.medio_pago === 'EFECTIVO' && caja === null) e.medio_pago = 'La caja está cerrada: abrila o pagá por transferencia.'
  return e
}
const sinSignos = (e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault() }

export default function Gastos() {
  const meses = ultimosMeses()
  const [mes, setMes] = useState(meses[0])
  const [tipo, setTipo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [buscar, setBuscar] = useState('')
  const texto = useDeferredValue(buscar.trim())
  const [editando, setEditando] = useState(null) // null cerrado · {} alta · gasto edición
  const [anulando, setAnulando] = useState(null)
  const esAdministrador = useEsAdministrador()

  const resumen = useQuery({ queryKey: ['gastos', 'resumen', mes], queryFn: () => api(`/gastos/resumen/?mes=${mes}`) })
  const gastos = useQuery({
    queryKey: ['gastos', 'mes', mes, tipo, texto],
    queryFn: () => api(`/gastos/?desde=${mes}-01&hasta=${ultimoDia(mes)}&page_size=500${tipo ? `&tipo=${tipo}` : ''}${texto ? `&search=${encodeURIComponent(texto)}` : ''}`),
  })
  const filas = (gastos.data?.results ?? []).filter((g) => !categoria || categoriaDe(g.categoria).nombre === categoria)
  const sumaVisible = filas.filter((g) => g.estado !== 'ANULADO').reduce((s, g) => s + Number(g.importe), 0)
  const r = resumen.data
  const total = Number(r?.total ?? 0)
  const parte = (v) => `${total ? Math.round((Number(v) / total) * 100) : 0} % del total`
  const registros = (gastos.data?.results ?? []).filter((g) => g.estado !== 'ANULADO').length

  // Gráfico: las categorías del mes con su color (los «Alquiler» viejos suman en Feria / Puesto)
  const porCategoria = new Map()
  for (const c of r?.por_categoria ?? []) {
    const oficial = categoriaDe(c.categoria)
    porCategoria.set(oficial.nombre, (porCategoria.get(oficial.nombre) ?? 0) + Number(c.total))
  }
  const partes = CATEGORIAS_GASTO.map((c) => ({ nombre: c.nombre, valor: porCategoria.get(c.nombre) ?? 0, color: c.color }))
    .sort((a, b) => b.valor - a.valor)

  const nuevo = esAdministrador && <Boton icono="mas" onClick={() => setEditando({})}>Nuevo gasto</Boton>

  return (
    <>
      <CabeceraPagina titulo="Gastos" descripcion="Los fijos del mes se usan para calcular el precio de venta."
        acciones={(
          <div className="cab-pagina__acciones">
            <label className="pastilla pastilla--selector">
              <Icono nombre="calendario" tamano={18} />
              <span className="sr-only">Mes</span>
              <select value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => <option key={m} value={m}>{textoMes(m)}</option>)}
              </select>
            </label>
            {nuevo}
          </div>
        )} />

      <div className="cifras">
        <Cifra tono="oscuro" icono="gastos" titulo="Gastos del mes" valor={moneda(total)}
          insignia={`${registros} ${registros === 1 ? 'registro' : 'registros'} este mes`} />
        <Cifra tono="salmon" icono="etiqueta" titulo="Fijos" valor={moneda(r?.fijos ?? 0)}
          nota="Puesto feria, sueldos, servicios…" insignia={parte(r?.fijos ?? 0)} />
        <Cifra tono="arena" icono="compras" titulo="Variables" valor={moneda(r?.variables ?? 0)}
          nota="Bolsas, maples, mantenimiento…" insignia={parte(r?.variables ?? 0)} />
      </div>

      <div className="tablero-2">
        <section className="panel gastos-lista" aria-label="Gastos del mes">
          <div className="filtros">
            {[['', 'Todos'], ['FIJO', 'Fijos'], ['VARIABLE', 'Variables']].map(([v, t]) => (
              <button key={v} type="button" className="filtro" aria-pressed={tipo === v} onClick={() => setTipo(v)}>{t}</button>
            ))}
            <div className="filtros__der">
              <label className="filtro filtro--selector">
                <span className="sr-only">Categoría</span>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="">Todas las categorías</option>
                  {CATEGORIAS_GASTO.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </label>
              <label className="buscador">
                <Icono nombre="buscar" tamano={16} />
                <span className="sr-only">Buscar gasto</span>
                <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar gasto…" autoComplete="off" />
              </label>
            </div>
          </div>

          {gastos.isPending ? <p className="abm-cargando">Cargando…</p> : filas.length === 0 ? (
            <EstadoVacio icono="gastos" titulo={`No hay gastos en ${textoMes(mes).toLowerCase()}`}
              texto="Cargá el puesto de la feria y los sueldos del mes para que el precio sugerido los tenga en cuenta.">{nuevo}</EstadoVacio>
          ) : (
            <div className="tabla-wrap">
              <table className="tabla tabla-gastos">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">Categoría</th><th scope="col">Tipo</th>
                    <th scope="col">Pago</th><th scope="col" className="num">Importe</th>
                    {esAdministrador && <th scope="col"><span className="sr-only">Acciones</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((g) => {
                    const cat = categoriaDe(g.categoria)
                    const anulado = g.estado === 'ANULADO'
                    return (
                      <tr key={g.id_gasto} className={anulado ? 'is-anulada' : undefined}>
                        <td>{fecha(g.fecha).slice(0, 5)}</td>
                        <td>
                          <strong>{g.concepto}</strong>
                          {anulado
                            ? <span title={g.motivo_anulacion} className="gasto-insignia"><Insignia variante="peligro">Anulado</Insignia></span>
                            : g.fecha_modificacion && <span className="gasto-insignia"><Insignia variante="neutro">Modificado</Insignia></span>}
                        </td>
                        <td><span className="con-punto"><span className="punto-color" style={{ background: cat.color }} aria-hidden="true" />{cat.nombre}</span></td>
                        <td><span className={`tipo-gasto is-${g.tipo.toLowerCase()}`}>{g.tipo_texto}</span></td>
                        <td>{g.medio_pago === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}</td>
                        <td className="num"><strong className="tabla-gastos__importe">{moneda(g.importe)}</strong></td>
                        {esAdministrador && (
                          <td className="tabla-gastos__acciones">
                            {!anulado && (
                              <>
                                <button type="button" className="btn btn--fantasma" onClick={() => setEditando(g)}
                                  aria-label={`Editar ${g.concepto}`} title="Editar"><Icono nombre="editar" tamano={17} /></button>
                                <button type="button" className="btn btn--fantasma tabla-gastos__anular" onClick={() => setAnulando(g)}
                                  aria-label={`Anular ${g.concepto}`} title="Anular"><Icono nombre="anular" tamano={17} /></button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>{tipo || categoria || texto ? 'Total de lo filtrado' : 'Total del mes'} <span className="suave">(sin anulados)</span></td>
                    <td className="num"><strong>{moneda(sumaVisible)}</strong></td>
                    {esAdministrador && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <aside className="panel gastos-lado" aria-labelledby="gastos-distribucion">
          <h2 id="gastos-distribucion" className="panel__titulo">Distribución por categoría</h2>
          <Dona partes={partes} etiqueta="Gastos por categoría" centro={moneda(total)} nota={textoMes(mes)} />
          <BasePrecio base={r?.base_precio} />
        </aside>
      </div>

      {editando && <FormularioGasto gasto={editando} alCerrar={() => setEditando(null)} />}
      {anulando && <AnularGasto gasto={anulando} alCerrar={() => setAnulando(null)} />}
    </>
  )
}

// Lo que hoy toma el calculador de precios. El día 1 (sin fijos cargados todavía) usa los del mes anterior.
function BasePrecio({ base }) {
  if (!base) return null
  return (
    <div className="recuadro">
      <span className="recuadro__titulo"><Icono nombre="etiqueta" tamano={17} /> Base para precio de venta</span>
      <span>Fijos mensuales: <strong>{moneda(base.fijos)}</strong></span>
      <span className="recuadro__nota">
        {base.respaldo
          ? `Todavía no hay fijos este mes: se usan los de ${textoMes(base.mes).toLowerCase()}.`
          : 'Usado para el cálculo de costos.'}
      </span>
    </div>
  )
}

// Alta y edición. Categoría y tipo con botones (el tipo se sugiere según la categoría y se puede cambiar).
// Con la caja cerrada no se puede pagar en efectivo, y el efectivo no puede pasar de lo que hay en la caja.
function FormularioGasto({ gasto, alCerrar }) {
  const editar = Boolean(gasto.id_gasto)
  const caja = useQuery({ queryKey: ['caja', 'actual'], queryFn: () => api('/cajas/actual/'), enabled: !editar })
  const abierta = caja.data ?? null
  const cajaCerrada = caja.isSuccess && !abierta
  const [categoria, setCategoria] = useState(gasto.categoria ? categoriaDe(gasto.categoria).nombre : '')
  const [tipo, setTipo] = useState(gasto.tipo ?? 'VARIABLE')
  const [medio, setMedio] = useState(gasto.medio_pago ?? 'EFECTIVO')
  const medioVisto = !editar && cajaCerrada ? 'TRANSFERENCIA' : medio

  function elegirCategoria(c) {
    setCategoria(c.nombre)
    if (!editar || !gasto.tipo) setTipo(c.tipo) // sugerencia; se puede cambiar a mano
  }

  return (
    <FormularioABM recurso="gastos" id={gasto.id_gasto} alCerrar={alCerrar}
      validar={(d) => validarGasto(d, editar ? undefined : caja.isSuccess ? abierta : undefined)}
      titulo={editar ? 'Editar gasto' : 'Nuevo gasto'}
      descripcion={editar ? 'El importe y el medio de pago no se cambian.' : 'En efectivo se descuenta automáticamente de la caja abierta.'}>
      {(errores) => (
        <div className="gasto-form">
          <Campo etiqueta="Concepto" name="concepto" defaultValue={gasto.concepto} error={errores.concepto}
            autoComplete="off" placeholder="Ej: Puesto de feria, nafta, bolsas…" data-foco />

          <fieldset className="gasto-form__grupo">
            <legend className="campo__label">Categoría</legend>
            <div className="pildoras">
              {CATEGORIAS_GASTO.map((c) => (
                <button key={c.nombre} type="button" className="pildora" aria-pressed={categoria === c.nombre} onClick={() => elegirCategoria(c)}>
                  <span className="punto-color" style={{ background: c.color }} aria-hidden="true" />{c.nombre}
                </button>
              ))}
            </div>
            <input type="hidden" name="categoria" value={categoria} />
            {errores.categoria && <p className="campo__error">{errores.categoria}</p>}
          </fieldset>

          <div className="fila-2">
            <fieldset className="gasto-form__grupo">
              <legend className="campo__label">Tipo</legend>
              <div className="segmentado">
                <button type="button" className="is-fijo" aria-pressed={tipo === 'FIJO'} onClick={() => setTipo('FIJO')}>Fijo</button>
                <button type="button" aria-pressed={tipo === 'VARIABLE'} onClick={() => setTipo('VARIABLE')}>Variable</button>
              </div>
              <input type="hidden" name="tipo" value={tipo} />
            </fieldset>
            <Campo etiqueta="Fecha" name="fecha" type="date" max={hoyISO()} defaultValue={gasto.fecha ?? hoyISO()} error={errores.fecha} />
          </div>

          <div className="fila-2">
            <Campo etiqueta="Importe" name="importe" type="number" inputMode="decimal" min="0.01" step="0.01" max={IMPORTE_MAX}
              className="campo--pesos" placeholder="0" onKeyDown={sinSignos} onWheel={(e) => e.currentTarget.blur()}
              defaultValue={gasto.importe} error={errores.importe} readOnly={editar}
              ayuda={editar ? 'No se cambia: si está mal, anulá el gasto y cargalo de nuevo.'
                : medioVisto === 'EFECTIVO' && abierta ? `En la caja hay ${moneda(abierta.saldo_actual)}.` : undefined} />
            <fieldset className="gasto-form__grupo">
              <legend className="campo__label">Medio de pago</legend>
              <div className="segmentado">
                <button type="button" className="is-efectivo" aria-pressed={medioVisto === 'EFECTIVO'} disabled={editar || cajaCerrada}
                  onClick={() => setMedio('EFECTIVO')}>Efectivo<small>Sale de caja</small></button>
                <button type="button" aria-pressed={medioVisto === 'TRANSFERENCIA'} disabled={editar} onClick={() => setMedio('TRANSFERENCIA')}>Transferencia</button>
              </div>
              {!editar && <input type="hidden" name="medio_pago" value={medioVisto} />}
              {cajaCerrada && !editar && (
                <p className="campo__ayuda gasto-form__aviso"><Icono nombre="alerta" tamano={16} /> La caja está cerrada: abrila en Caja para pagar en efectivo.</p>
              )}
              {errores.medio_pago && <p className="campo__error">{errores.medio_pago}</p>}
            </fieldset>
          </div>
        </div>
      )}
    </FormularioABM>
  )
}

function AnularGasto({ gasto, alCerrar }) {
  const cliente = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const anular = useMutation({
    mutationFn: () => api(`/gastos/${gasto.id_gasto}/anular/`, { metodo: 'POST', datos: { motivo } }),
    onSuccess: () => {
      for (const clave of ['gastos', 'precios', 'caja']) cliente.invalidateQueries({ queryKey: [clave] })
      alCerrar()
    },
  })
  const errores = erroresDe(anular.error)
  const enviar = () => { if (motivo.trim().length >= 3) anular.mutate() }
  const efectivo = gasto.medio_pago === 'EFECTIVO'

  return (
    <Dialogo titulo="Anular el gasto" descripcion={`${gasto.concepto} · ${moneda(gasto.importe)}`} alCerrar={alCerrar}>
      <form className="dialogo__cuerpo compra-form" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <div className="compra-aviso-anular">
          <Icono nombre="alerta" />
          <div>
            <p>
              El gasto no se borra: queda en la lista como anulado y deja de contar en el mes
              {gasto.tipo === 'FIJO' ? ' y en el precio sugerido' : ''}.
              {efectivo ? <> Los <strong>{moneda(gasto.importe)}</strong> vuelven a la caja abierta.</> : ''}
            </p>
            <p><strong>No se puede deshacer.</strong></p>
          </div>
        </div>
        <Campo etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} error={errores.motivo}
          placeholder="Por ejemplo: se cargó dos veces" maxLength={200} data-foco required />
        {errores.general && (
          <div className="compra-resumen-error" role="alert"><Icono nombre="alerta" /><span>{errores.general}</span></div>
        )}
      </form>
      <footer className="dialogo__pie">
        <Boton variante="secundario" onClick={alCerrar}>Volver</Boton>
        <Boton variante="peligro" cargando={anular.isPending} textoCargando="Anulando…" disabled={motivo.trim().length < 3} onClick={enviar}>
          Anular gasto
        </Boton>
      </footer>
    </Dialogo>
  )
}
