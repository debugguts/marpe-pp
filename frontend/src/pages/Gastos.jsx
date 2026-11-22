import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Cifra from '../components/Cifra'
import Dialogo from '../components/Dialogo'
import FormularioABM from '../components/FormularioABM'
import Icono from '../components/Icono'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { fecha, hoyISO, moneda } from '../lib/formato'
import { useEsAdministrador } from '../lib/sesion'
import '../styles/movimientos.css'

// Gastos del negocio (S5-13 · HU-09). Los FIJOS (alquiler, combustible…) se usan
// para calcular el precio sugerido; en efectivo salen de la caja abierta.
const CATEGORIAS = ['Alquiler', 'Combustible', 'Servicios', 'Insumos', 'Sueldos', 'Mantenimiento', 'Otros']
const IMPORTE_MAX = 100000000

// Revisa el formulario antes de mandarlo (los mismos controles hace la API).
function validarGasto(d) {
  const e = {}
  if (!d.concepto?.trim()) e.concepto = 'Escribí el concepto.'
  else if (d.concepto.trim().length < 3) e.concepto = 'El concepto tiene que tener al menos 3 letras.'
  if (!d.categoria?.trim()) e.categoria = 'Indicá la categoría.'
  if (!d.fecha) e.fecha = 'Indicá la fecha del gasto.'
  else if (d.fecha > hoyISO()) e.fecha = 'La fecha no puede ser posterior a hoy.'
  if ('importe' in d) {
    if (d.importe === '') e.importe = 'Indicá el importe.'
    else if (!/^\d+(\.\d{1,2})?$/.test(d.importe) || Number(d.importe) <= 0) e.importe = 'El importe tiene que ser mayor a 0 (hasta 2 decimales).'
    else if (Number(d.importe) > IMPORTE_MAX) e.importe = 'El importe no puede pasar de $ 100.000.000.'
  }
  return e
}
const sinSignos = (e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault() }

export default function Gastos() {
  const [tipo, setTipo] = useState('')
  const [editando, setEditando] = useState(null) // null cerrado · {} alta · gasto edición
  const [anulando, setAnulando] = useState(null)
  const esAdministrador = useEsAdministrador()
  const resumen = useQuery({ queryKey: ['gastos', 'resumen'], queryFn: () => api('/gastos/resumen/') })
  const gastos = useQuery({ queryKey: ['gastos', tipo], queryFn: () => api(`/gastos/${tipo ? `?tipo=${tipo}` : ''}`) })
  const filas = gastos.data?.results ?? []
  const nuevo = <Boton icono="mas" onClick={() => setEditando({})}>Nuevo gasto</Boton>

  return (
    <>
      <CabeceraPagina titulo="Gastos" descripcion="Los fijos del mes se usan para calcular el precio de venta." acciones={nuevo} />

      {resumen.data && (
        <div className="cifras">
          <Cifra titulo="Gastos del mes" valor={moneda(resumen.data.total)} destacada />
          <Cifra titulo="Fijos" valor={moneda(resumen.data.fijos)} nota="Alquiler, combustible…" />
          <Cifra titulo="Variables" valor={moneda(resumen.data.variables)} nota="Bolsas, arreglos…" />
        </div>
      )}

      <div className="segmentado" role="group" aria-label="Qué gastos mostrar">
        {[['', 'Todos'], ['FIJO', 'Fijos'], ['VARIABLE', 'Variables']].map(([v, texto]) => (
          <button key={v} type="button" className="segmentado__opcion" aria-pressed={tipo === v} onClick={() => setTipo(v)}>{texto}</button>
        ))}
      </div>

      {gastos.isPending ? <p className="abm-cargando">Cargando…</p> : filas.length === 0 ? (
        <EstadoVacio icono="gastos" titulo="No hay gastos" texto="Cargá el alquiler y el combustible del mes para que el precio sugerido los tenga en cuenta.">{nuevo}</EstadoVacio>
      ) : (
        <Panel>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">Categoría</th><th scope="col">Tipo</th>
                  <th scope="col">Pago</th><th scope="col" className="num">Importe</th><th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((g) => (
                  <tr key={g.id_gasto} className={g.estado === 'ANULADO' ? 'is-anulada' : undefined}>
                    <td>{fecha(g.fecha)}</td>
                    <td>
                      <strong>{g.concepto}</strong>
                      {g.estado === 'ANULADO'
                        ? <span title={g.motivo_anulacion} className="gasto-insignia"><Insignia variante="peligro">Anulado</Insignia></span>
                        : g.fecha_modificacion && <span className="gasto-insignia"><Insignia variante="marca">Modificado</Insignia></span>}
                    </td>
                    <td>{g.categoria}</td>
                    <td><Insignia variante={g.tipo === 'FIJO' ? 'marca' : 'neutro'}>{g.tipo_texto}</Insignia></td>
                    <td>{g.medio_pago === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}</td>
                    <td className="num compra-total-celda">{moneda(g.importe)}</td>
                    <td className="compra-acciones">
                      {esAdministrador && g.estado !== 'ANULADO' && (
                        <>
                          <button type="button" className="btn btn--fantasma" onClick={() => setEditando(g)} aria-label={`Editar ${g.concepto}`}>
                            <Icono nombre="editar" /><span>Editar</span>
                          </button>
                          <button type="button" className="btn btn--fantasma compra-acciones__anular" onClick={() => setAnulando(g)} aria-label={`Anular ${g.concepto}`}>
                            <Icono nombre="anular" /><span>Anular</span>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {editando && (
        <FormularioABM recurso="gastos" id={editando.id_gasto} alCerrar={() => setEditando(null)} validar={validarGasto}
          titulo={editando.id_gasto ? 'Editar gasto' : 'Nuevo gasto'}
          descripcion={editando.id_gasto ? 'El importe y el medio de pago no se cambian.' : 'En efectivo sale de la caja abierta.'}>
          {(errores) => (
            <>
              <Campo etiqueta="Concepto" name="concepto" defaultValue={editando.concepto} error={errores.concepto}
                autoComplete="off" placeholder="Alquiler de noviembre" data-foco />
              <div className="fila-2">
                <Campo etiqueta="Categoría" name="categoria" defaultValue={editando.categoria} error={errores.categoria}
                  list="categorias-gasto" autoComplete="off" />
                <Campo as="select" etiqueta="Tipo" name="tipo" defaultValue={editando.tipo ?? 'VARIABLE'} error={errores.tipo}>
                  <option value="VARIABLE">Variable</option>
                  <option value="FIJO">Fijo (entra en el precio)</option>
                </Campo>
              </div>
              <datalist id="categorias-gasto">{CATEGORIAS.map((c) => <option key={c} value={c} />)}</datalist>
              <div className="fila-2">
                <Campo etiqueta="Fecha" name="fecha" type="date" max={hoyISO()} defaultValue={editando.fecha ?? hoyISO()} error={errores.fecha} />
                <Campo etiqueta="Importe" name="importe" type="number" inputMode="decimal" min="0.01" step="0.01" max={IMPORTE_MAX}
                  className="campo--importe" placeholder="0,00" onKeyDown={sinSignos} onWheel={(e) => e.currentTarget.blur()}
                  defaultValue={editando.importe} error={errores.importe} readOnly={Boolean(editando.id_gasto)}
                  ayuda={editando.id_gasto ? 'No se cambia: si está mal, anulá el gasto y cargalo de nuevo.' : undefined} />
              </div>
              <Campo as="select" etiqueta="Medio de pago" name="medio_pago" defaultValue={editando.medio_pago ?? 'EFECTIVO'}
                error={errores.medio_pago} disabled={Boolean(editando.id_gasto)}>
                <option value="EFECTIVO">Efectivo (sale de la caja)</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </Campo>
            </>
          )}
        </FormularioABM>
      )}
      {anulando && <AnularGasto gasto={anulando} alCerrar={() => setAnulando(null)} />}
    </>
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
