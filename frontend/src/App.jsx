import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import RutaPrivada from './components/RutaPrivada'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import { NoEncontrada, Pendiente } from './pages/Pendiente'

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
              <Route
                path="catalogo"
                element={<Pendiente titulo="Catálogo" icono="catalogo" texto="Acá vas a administrar productos, presentaciones y precios." />}
              />
              <Route
                path="clientes"
                element={<Pendiente titulo="Clientes" icono="clientes" texto="Acá vas a administrar clientes y su cuenta corriente." />}
              />
              <Route
                path="proveedores"
                element={<Pendiente titulo="Proveedores" icono="proveedores" texto="Acá vas a administrar proveedores y sus datos de contacto." />}
              />
              <Route path="*" element={<NoEncontrada />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
