import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSesion } from '../lib/sesion'

// Deja pasar solo a quien inició sesión. Al resto lo manda al login
// y recuerda a qué página quería ir, para llevarlo ahí después de ingresar.
export default function RutaPrivada() {
  const { data: usuario, isPending } = useSesion()
  const ubicacion = useLocation()

  if (isPending) return <p className="cargando" role="status">Cargando…</p>
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />
  return <Outlet />
}
