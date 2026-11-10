import { useState } from 'react'
import FormularioABM from '../components/FormularioABM'
import ListadoABM from '../components/ListadoABM'
import { Boton, CabeceraPagina, Campo } from '../components/ui'

// Pantalla ABM de Proveedores (S4-08 · HU-03).
const COLUMNAS = [
  { titulo: 'Nombre', valor: (p) => <strong>{p.nombre}</strong> },
  { titulo: 'Teléfono', valor: (p) => p.telefono },
  { titulo: 'Dirección', valor: (p) => p.direccion },
]

export default function Proveedores() {
  // null = ventana cerrada · {} = alta nueva · proveedor = edición
  const [editando, setEditando] = useState(null)
  const nuevo = <Boton icono="mas" onClick={() => setEditando({})}>Nuevo proveedor</Boton>

  return (
    <>
      <CabeceraPagina titulo="Proveedores" descripcion="Quiénes te venden los huevos y cómo contactarlos." acciones={nuevo} />

      <ListadoABM
        recurso="proveedores"
        clave="id_proveedor"
        columnas={COLUMNAS}
        nombreDe={(p) => p.nombre}
        alEditar={setEditando}
        buscarTexto="Buscar por nombre o teléfono"
        vacio={{ icono: 'proveedores', titulo: 'Todavía no hay proveedores', texto: 'Cargá el primero para registrar compras y costos.', accion: nuevo }}
      />

      {editando && (
        <FormularioABM
          recurso="proveedores"
          id={editando.id_proveedor}
          titulo={editando.id_proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
          alCerrar={() => setEditando(null)}
        >
          {(errores) => (
            <>
              <Campo etiqueta="Nombre" name="nombre" defaultValue={editando.nombre} error={errores.nombre}
                required autoComplete="off" data-foco />
              <Campo etiqueta="Teléfono (opcional)" name="telefono" type="tel" defaultValue={editando.telefono ?? ''}
                error={errores.telefono} inputMode="tel" autoComplete="off" placeholder="387-4001001" />
              <Campo etiqueta="Dirección (opcional)" name="direccion" defaultValue={editando.direccion ?? ''}
                error={errores.direccion} autoComplete="off" />
            </>
          )}
        </FormularioABM>
      )}
    </>
  )
}
