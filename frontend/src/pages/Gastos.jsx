import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Cifra from '../components/Cifra'
import FormularioABM from '../components/FormularioABM'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import { api } from '../lib/api'
import { fecha, hoyISO, moneda } from '../lib/formato'
import '../styles/movimientos.css'

// Gastos del negocio (S5-13 · HU-09). Los FIJOS (alquiler, combustible…) se usan
// para calcular el precio sugerido; en efectivo salen de la caja abierta.
const CATEGORIAS = ['Alquiler', 'Combustible', 'Servicios', 'Insumos', 'Sueldos', 'Mantenimiento', 'Otros']

export default function Gastos() {
  const [tipo, setTipo] = useState('')
  const [editando, setEditando] = useState(null) // null cerrado · {} alta · gasto edición
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
                  <tr key={g.id_gasto}>
                    <td>{fecha(g.fecha)}</td>
                    <td><strong>{g.concepto}</strong></td>
                    <td>{g.categoria}</td>
                    <td><Insignia variante={g.tipo === 'FIJO' ? 'marca' : 'neutro'}>{g.tipo_texto}</Insignia></td>
                    <td>{g.medio_pago === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}</td>
                    <td className="num">{moneda(g.importe)}</td>
                    <td className="num">
                      <Boton variante="fantasma" icono="editar" onClick={() => setEditando(g)} aria-label={`Editar ${g.concepto}`}>Editar</Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {editando && (
        <FormularioABM recurso="gastos" id={editando.id_gasto} alCerrar={() => setEditando(null)}
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
                <Campo etiqueta="Fecha" name="fecha" type="date" defaultValue={editando.fecha ?? hoyISO()} error={errores.fecha} />
                <Campo etiqueta="Importe" name="importe" type="number" inputMode="decimal" min="0" step="any"
                  defaultValue={editando.importe} error={errores.importe} readOnly={Boolean(editando.id_gasto)} />
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
    </>
  )
}
