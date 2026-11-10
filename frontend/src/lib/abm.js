import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

// Pedidos de las pantallas ABM (proveedores, clientes, productos, presentaciones).
// "recurso" es la parte de la dirección: por ejemplo 'proveedores' → /api/proveedores/

// Lista paginada. Filtros: buscar (texto), estado (ACTIVO, INACTIVO o '' para todos) y página.
export function useListado(recurso, { buscar = '', estado = 'ACTIVO', pagina = 1 } = {}) {
  const parametros = new URLSearchParams({ page: pagina })
  if (buscar) parametros.set('search', buscar)
  if (estado) parametros.set('estado', estado)

  return useQuery({
    queryKey: [recurso, buscar, estado, pagina],
    queryFn: () => api(`/${recurso}/?${parametros}`),
    placeholderData: keepPreviousData, // mientras carga la página nueva se sigue viendo la anterior
  })
}

// Alta (sin id) o modificación (con id). Al terminar, el listado se vuelve a pedir solo.
export function useGuardar(recurso) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, datos }) =>
      id
        ? api(`/${recurso}/${id}/`, { metodo: 'PATCH', datos })
        : api(`/${recurso}/`, { metodo: 'POST', datos }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: [recurso] }),
  })
}

// Baja lógica: Django lo pasa a INACTIVO, no lo borra.
export function useBaja(recurso) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (id) => api(`/${recurso}/${id}/`, { metodo: 'DELETE' }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: [recurso] }),
  })
}

// Los errores pueden venir anidados (por ejemplo, uno por cada línea de una venta):
// se juntan todos los mensajes en un solo texto, sin repetir.
function aTexto(mensajes) {
  if (Array.isArray(mensajes)) return [...new Set(mensajes.map(aTexto).filter(Boolean))].join(' ')
  if (mensajes && typeof mensajes === 'object') return aTexto(Object.values(mensajes))
  return String(mensajes ?? '')
}

// Convierte la respuesta de error de Django en mensajes por campo.
// Ejemplo: { nombre: ["Ingresá el nombre"] } → { nombre: "Ingresá el nombre" }
// Los errores que no son de un campo quedan en "general".
export function erroresDe(error) {
  if (!error) return {}
  const datos = error.datos
  if (!datos || typeof datos !== 'object' || datos.detail) return { general: error.message }

  const errores = {}
  for (const [campo, mensajes] of Object.entries(datos)) {
    const texto = aTexto(mensajes)
    const clave = campo === 'non_field_errors' ? 'general' : campo
    errores[clave] = texto
  }
  return errores
}
