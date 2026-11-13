import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi } from './api'

// Pregunta a Django quién está conectado. Si no hay nadie, devuelve null (no es un error).
async function pedirUsuario() {
  try {
    return await api('/auth/yo/')
  } catch (error) {
    if (error instanceof ErrorApi && error.estado === 401) return null
    throw error
  }
}

// El usuario conectado, compartido por toda la aplicación.
export function useSesion() {
  return useQuery({ queryKey: ['sesion'], queryFn: pedirUsuario, staleTime: Infinity, retry: false })
}

export function useLogin() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (datos) => api('/auth/login/', { metodo: 'POST', datos }),
    onSuccess: (usuario) => cliente.setQueryData(['sesion'], usuario),
  })
}

export function useLogout() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: () => api('/auth/logout/', { metodo: 'POST' }),
    onSuccess: () => cliente.setQueryData(['sesion'], null),
  })
}

// true si el usuario conectado es Administrador. La pantalla lo usa para esconder lo que el
// Operador no puede hacer; igual la API rechaza (403) cualquier intento.
export function useEsAdministrador() {
  return useSesion().data?.rol === 'Administrador'
}
