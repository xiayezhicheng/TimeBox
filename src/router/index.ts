import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'

const isSSR =
  typeof window === 'undefined' ||
  (import.meta.env.SSR as boolean | undefined) === true

const history = isSSR ? createMemoryHistory('/') : createWebHistory()

export const router = createRouter({
  history,
  routes: [
    {
      path: '/',
      name: 'focus',
      component: () => import('../views/FocusView.vue'),
    },
    {
      path: '/plan',
      name: 'plan',
      component: () => import('../views/PlanView.vue'),
    },
    {
      path: '/log',
      name: 'log',
      component: () => import('../views/LogView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
  ],
})

export default router
