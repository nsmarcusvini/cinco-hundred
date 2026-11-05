import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import AdminLayout from './AdminLayout'

const Overview = lazy(() => import('./AdminOverview'))
const Users = lazy(() => import('./AdminUsers'))
const UserDetail = lazy(() => import('./AdminUserDetail'))
const Usage = lazy(() => import('./AdminUsage'))
const Funnel = lazy(() => import('./AdminFunnel'))

/** Telas do painel. Só carrega depois que o banco confirma a sessão de admin (RequireAdmin). */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Overview />} />
        <Route path="usuarios" element={<Users />} />
        <Route path="usuarios/:id" element={<UserDetail />} />
        <Route path="uso" element={<Usage />} />
        <Route path="funil" element={<Funnel />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}
