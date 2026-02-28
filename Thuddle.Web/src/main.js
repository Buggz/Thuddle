import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { vueKeycloak } from '@josempgon/vue-keycloak'
import App from './App.vue'
import initRouter from './router'
import './assets/main.css'

;(async () => {
  const app = createApp(App)

  app.use(createPinia())

  // Initialize Keycloak BEFORE the router so hash fragments are consumed
  // before vue-router's history tries to parse them.
  await vueKeycloak.install(app, {
    config: {
      url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
      realm: import.meta.env.VITE_KEYCLOAK_REALM || 'Thuddle',
      clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'thuddle-web',
    },
    initOptions: {
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      pkceMethod: 'S256',
    },
  })

  const router = initRouter()
  app.use(router)
  app.mount('#app')
})()
