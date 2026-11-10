import { useState } from 'react'
import FormularioABM from '../components/FormularioABM'
import ListadoABM from '../components/ListadoABM'
import { Boton, CabeceraPagina, Campo } from '../components/ui'

// Pantalla ABM de Clientes (S4-12 · HU-07).
// «Consumidor final» (id 1) es del sistema: se muestra, pero sin Editar ni Dar de baja.
const CONSUMIDOR_FINAL_ID = 1

const COLUMNAS = [
  { titulo: 'Nombre', valor: (c) => <strong>{c.nombre}</strong> },
  { titulo: 'Teléfono', valor: (c) => c.telefono },
]

export default function Clientes() {
  const [editando, setEditando] = useState(null) // null cerrado · {} alta · cliente edición
  const nuevo = <Boton icono="mas" onClick={() => setEditando({})}>Nuevo cliente</Boton>

  return (
    <>
      <CabeceraPagina titulo="Clientes" descripcion="Clientes habituales; las ventas sin nombre van a «Consumidor final»." acciones={nuevo} />

      <ListadoABM
        recurso="clientes"
        clave="id_cliente"
        columnas={COLUMNAS}
        nombreDe={(c) => c.nombre}
        alEditar={setEditando}
        protegido={(c) => c.id_cliente === CONSUMIDOR_FINAL_ID}
        buscarTexto="Buscar por nombre o teléfono"
        vacio={{ icono: 'clientes', titulo: 'Todavía no hay clientes', texto: 'Cargá los clientes habituales para venderles fiado.', accion: nuevo }}
      />

      {editando && (
        <FormularioABM
          recurso="clientes"
          id={editando.id_cliente}
          titulo={editando.id_cliente ? 'Editar cliente' : 'Nuevo cliente'}
          alCerrar={() => setEditando(null)}
        >
          {(errores) => (
            <>
              <Campo etiqueta="Nombre" name="nombre" defaultValue={editando.nombre} error={errores.nombre}
                required autoComplete="off" data-foco />
              <Campo etiqueta="Teléfono (opcional)" name="telefono" type="tel" defaultValue={editando.telefono ?? ''}
                error={errores.telefono} inputMode="tel" autoComplete="off" placeholder="387-4001001" />
            </>
          )}
        </FormularioABM>
      )}
    </>
  )
}
