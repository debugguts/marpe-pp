import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import FormularioABM from '../components/FormularioABM'
import ListadoABM from '../components/ListadoABM'
import { Boton, CabeceraPagina, Campo } from '../components/ui'
import { useEsAdministrador } from '../lib/sesion'
import { numero } from '../lib/formato'
import Precios from './Precios'

// Pantalla de Catálogo (S4-10 · HU-02): solapas Productos, Presentaciones y Precios (S5-10).
// La solapa elegida queda en la dirección (?ver=presentaciones) para poder compartirla o recargar.
const SOLAPAS = [['productos', 'Productos'], ['presentaciones', 'Presentaciones'], ['precios', 'Precios']]
const TIPOS = [['BLANCO', 'Blanco'], ['CASTAÑO', 'Castaño']]
const TAMANOS = [['MEDIANO', 'Mediano'], ['SELECCIÓN', 'Selección'], ['SÚPER', 'Súper']]
const textoDe = (opciones, valor) => opciones.find(([v]) => v === valor)?.[1] ?? valor

export default function Catalogo() {
  const [parametros, setParametros] = useSearchParams()
  const ver = SOLAPAS.some(([v]) => v === parametros.get('ver')) ? parametros.get('ver') : 'productos'
  const [editando, setEditando] = useState(null) // null cerrado · {} alta · registro edición

  const esAdministrador = useEsAdministrador() // el Operador solo consulta
  const nuevo = esAdministrador && ver !== 'precios' && (
    <Boton icono="mas" onClick={() => setEditando({})}>
      {ver === 'productos' ? 'Nuevo producto' : 'Nueva presentación'}
    </Boton>
  )

  return (
    <>
      <CabeceraPagina titulo="Catálogo" descripcion="Los huevos que se venden, en qué presentaciones y a qué precio." acciones={nuevo} />

      <div className="segmentado" role="group" aria-label="Qué mostrar">
        {SOLAPAS.map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            className="segmentado__opcion"
            aria-pressed={ver === valor}
            onClick={() => { setParametros(valor === 'productos' ? {} : { ver: valor }); setEditando(null) }}
          >
            {texto}
          </button>
        ))}
      </div>

      {ver === 'productos' && <Productos editando={editando} setEditando={setEditando} nuevo={nuevo} />}
      {ver === 'presentaciones' && <Presentaciones editando={editando} setEditando={setEditando} nuevo={nuevo} />}
      {ver === 'precios' && <Precios />}
    </>
  )
}

function Productos({ editando, setEditando, nuevo }) {
  return (
    <>
      <ListadoABM
        soloLectura={!nuevo}
        key="productos"
        recurso="productos"
        clave="id_producto"
        columnas={[
          { titulo: 'Producto', valor: (p) => <strong>{p.nombre}</strong> },
          { titulo: 'Tipo', valor: (p) => textoDe(TIPOS, p.tipo_huevo) },
          { titulo: 'Tamaño', valor: (p) => textoDe(TAMANOS, p.tamano) },
        ]}
        nombreDe={(p) => p.nombre}
        alEditar={setEditando}
        buscarTexto="Buscar por tipo o tamaño"
        vacio={{ icono: 'catalogo', titulo: 'Todavía no hay productos', texto: 'Un producto es un tipo y tamaño de huevo: por ejemplo, Blanco Súper.', accion: nuevo }}
      />

      {editando && (
        <FormularioABM
          recurso="productos"
          id={editando.id_producto}
          titulo={editando.id_producto ? 'Editar producto' : 'Nuevo producto'}
          descripcion="No puede haber dos productos con el mismo tipo y tamaño."
          alCerrar={() => setEditando(null)}
        >
          {(errores) => (
            <>
              <Campo as="select" etiqueta="Tipo de huevo" name="tipo_huevo" defaultValue={editando.tipo_huevo ?? 'BLANCO'}
                error={errores.tipo_huevo} data-foco>
                {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </Campo>
              <Campo as="select" etiqueta="Tamaño" name="tamano" defaultValue={editando.tamano ?? 'MEDIANO'}
                error={errores.tamano}>
                {TAMANOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </Campo>
            </>
          )}
        </FormularioABM>
      )}
    </>
  )
}

function Presentaciones({ editando, setEditando, nuevo }) {
  return (
    <>
      <ListadoABM
        soloLectura={!nuevo}
        key="presentaciones"
        recurso="presentaciones"
        clave="id_presentacion"
        columnas={[
          { titulo: 'Presentación', valor: (p) => <strong>{p.nombre}</strong> },
          { titulo: 'Equivale a (bandejas)', valor: (p) => numero(Number(p.cantidad_bandejas_equivalentes)), num: true },
        ]}
        nombreDe={(p) => p.nombre}
        alEditar={setEditando}
        buscarTexto="Buscar por nombre"
        vacio={{ icono: 'inventario', titulo: 'Todavía no hay presentaciones', texto: 'Por ejemplo: Bandeja (equivale a 1) o Caja (equivale a 6).', accion: nuevo }}
      />

      {editando && (
        <FormularioABM
          recurso="presentaciones"
          id={editando.id_presentacion}
          titulo={editando.id_presentacion ? 'Editar presentación' : 'Nueva presentación'}
          alCerrar={() => setEditando(null)}
        >
          {(errores) => (
            <>
              <Campo etiqueta="Nombre" name="nombre" defaultValue={editando.nombre} error={errores.nombre}
                required autoComplete="off" placeholder="Caja" data-foco />
              <Campo etiqueta="Equivale a cuántas bandejas" name="cantidad_bandejas_equivalentes" type="number"
                step="any" min="0" inputMode="decimal"
                defaultValue={editando.cantidad_bandejas_equivalentes ? Number(editando.cantidad_bandejas_equivalentes) : ''}
                error={errores.cantidad_bandejas_equivalentes}
                ayuda="El stock se cuenta en bandejas de 30 huevos: 1 caja = 6 bandejas, 1 unidad = 0,033333." />
            </>
          )}
        </FormularioABM>
      )}
    </>
  )
}
