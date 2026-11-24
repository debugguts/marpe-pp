import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import FondoAnimado from './components/FondoAnimado'
import RutaPrivada from './components/RutaPrivada'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Reportes from './pages/Reportes'
import Caja from './pages/Caja'
import Catalogo from './pages/Catalogo'
import Clientes from './pages/Clientes'
import Compras from './pages/Compras'
import Cuentas from './pages/Cuentas'
import Gastos from './pages/Gastos'
import Inventario from './pages/Inventario'
import Proveedores from './pages/Proveedores'
import Usuarios from './pages/Usuarios'
import Ventas from './pages/Ventas'
import { NoEncontrada } from './pages/Pendiente'
import { SESION_VENCIDA } from './lib/api'

const cliente = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

// El paisaje animado (con su cambio según la hora) va detrás de todo el sistema y se monta una sola vez:
// así no se reinicia al pasar del login al Inicio ni al cambiar de sección.
// El selector del momento del día y la profundidad con el mouse quedan solo en el login.
function FondoDelSistema() {
  const enLogin = useLocation().pathname === '/login'
  return <FondoAnimado conSelector={enLogin} parallax={enLogin} enSistema={!enLogin} />
}

export default function App() {
  // Si el servidor dice que la sesión ya no existe, se olvida el usuario guardado:
  // RutaPrivada lleva al login, que explica qué pasó.
  useEffect(() => {
    const alVencer = () => {
      cliente.setQueryData(['sesion'], null)
      cliente.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sesion' }) // datos del usuario anterior
      sessionStorage.setItem('marpe-sesion-vencida', '1')
    }
    window.addEventListener(SESION_VENCIDA, alVencer)
    return () => window.removeEventListener(SESION_VENCIDA, alVencer)
  }, [])

  return (
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <FondoDelSistema />
        <Routes>
          <Route path="login" element={<Login />} />
          {/* Todo lo de adentro pide haber iniciado sesión */}
          <Route element={<RutaPrivada />}>
            <Route element={<Layout />}>
              <Route index element={<Inicio />} />
              <Route path="catalogo" element={<Catalogo />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="proveedores" element={<Proveedores />} />
              <Route path="ventas" element={<Ventas />} />
              <Route path="caja" element={<Caja />} />
              <Route path="compras" element={<Compras />} />
              <Route path="gastos" element={<Gastos />} />
              <Route path="inventario" element={<Inventario />} />
              <Route path="cuentas" element={<Cuentas />} />
              <Route path="reportes" element={<Reportes />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="*" element={<NoEncontrada />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
