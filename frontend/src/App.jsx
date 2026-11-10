import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import RutaPrivada from './components/RutaPrivada'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Catalogo from './pages/Catalogo'
import Clientes from './pages/Clientes'
import Proveedores from './pages/Proveedores'
import Ventas from './pages/Ventas'
import { NoEncontrada } from './pages/Pendiente'

const cliente = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
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
              <Route path="*" element={<NoEncontrada />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
