@description('Azure region for all resources')
param location string = 'norwayeast'

@description('Azure region for Static Web App (limited availability)')
param swaLocation string = 'westeurope'

@description('Container image tag to deploy')
param imageTag string

@description('Container registry prefix (e.g. ghcr.io/owner)')
param containerRegistry string

@secure()
@description('PostgreSQL administrator password')
param postgresAdminPassword string

@secure()
@description('Keycloak administrator password')
param keycloakAdminPassword string

@description('Custom domain for Keycloak (e.g. auth.thuddle.app). Falls back to auto-generated FQDN if empty.')
param keycloakCustomDomain string = ''

@description('Custom domain for the API (e.g. api.thuddle.app). Falls back to auto-generated FQDN if empty.')
param apiCustomDomain string = ''

@description('Allowed origins for CORS (the public web frontend URL).')
param webAllowedOrigins array = [
  'https://thuddle.app'
]

var postgresAdminUser = 'thuddleadmin'
var suffix = uniqueString(resourceGroup().id)

// ─── Log Analytics ───────────────────────────────────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'thuddle-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ─── Container Apps Environment ──────────────────────────────────────────────

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'thuddle-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ─── PostgreSQL Flexible Server ──────────────────────────────────────────────

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'thuddle-pg-${suffix}'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  name: 'AllowAzureServices'
  parent: postgresServer
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Allow-list extensions on the server so `CREATE EXTENSION` succeeds from
// EF Core migrations. pg_trgm is used for fuzzy user search.
resource postgresExtensionsConfig 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  name: 'azure.extensions'
  parent: postgresServer
  properties: {
    value: 'PG_TRGM'
    source: 'user-override'
  }
}

resource thuddleDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  name: 'thuddledb'
  parent: postgresServer
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource keycloakDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  name: 'keycloakdb'
  parent: postgresServer
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ─── Managed Certificates (custom domains) ──────────────────────────────────

resource keycloakManagedCert 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (keycloakCustomDomain != '') {
  parent: containerAppsEnv
  name: replace(keycloakCustomDomain, '.', '-')
  location: location
  properties: {
    subjectName: keycloakCustomDomain
    domainControlValidation: 'CNAME'
  }
}

resource apiManagedCert 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (apiCustomDomain != '') {
  parent: containerAppsEnv
  name: replace(apiCustomDomain, '.', '-')
  location: location
  properties: {
    subjectName: apiCustomDomain
    domainControlValidation: 'CNAME'
  }
}

// ─── Storage Account ─────────────────────────────────────────────────────────

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'thuddle${suffix}'
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: 'default'
  parent: storageAccount
}

resource profilePicsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: 'profile-pictures'
  parent: blobService
}

resource eventImagesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: 'event-images'
  parent: blobService
  properties: {
    publicAccess: 'Blob'
  }
}

// ─── Keycloak Container App ──────────────────────────────────────────────────

resource keycloakApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'thuddle-keycloak'
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
        customDomains: keycloakCustomDomain != '' ? [
          {
            name: keycloakCustomDomain
            bindingType: 'SniEnabled'
            certificateId: keycloakManagedCert.id
          }
        ] : []
      }
      secrets: [
        {
          name: 'db-password'
          value: postgresAdminPassword
        }
        {
          name: 'keycloak-admin-password'
          value: keycloakAdminPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'keycloak'
          image: '${containerRegistry}/thuddle-keycloak:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'KC_DB', value: 'postgres' }
            { name: 'KC_DB_URL', value: 'jdbc:postgresql://${postgresServer.properties.fullyQualifiedDomainName}:5432/keycloakdb?sslmode=require' }
            { name: 'KC_DB_USERNAME', value: postgresAdminUser }
            { name: 'KC_DB_PASSWORD', secretRef: 'db-password' }
            { name: 'KC_HOSTNAME_STRICT', value: 'false' }
            { name: 'KC_PROXY_HEADERS', value: 'xforwarded' }
            { name: 'KC_HTTP_ENABLED', value: 'true' }
            { name: 'KC_HEALTH_ENABLED', value: 'true' }
            { name: 'KEYCLOAK_ADMIN', value: 'admin' }
            { name: 'KEYCLOAK_ADMIN_PASSWORD', secretRef: 'keycloak-admin-password' }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health/started'
                port: 9000
              }
              initialDelaySeconds: 15
              periodSeconds: 10
              failureThreshold: 12
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health/live'
                port: 9000
              }
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// ─── API Container App ───────────────────────────────────────────────────────

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'thuddle-api'
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
        customDomains: apiCustomDomain != '' ? [
          {
            name: apiCustomDomain
            bindingType: 'SniEnabled'
            certificateId: apiManagedCert.id
          }
        ] : []
      }
      secrets: [
        {
          name: 'db-connection-string'
          value: 'Host=${postgresServer.properties.fullyQualifiedDomainName};Database=thuddledb;Username=${postgresAdminUser};Password=${postgresAdminPassword};SSL Mode=Require'
        }
        {
          name: 'storage-connection-string'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${containerRegistry}/thuddle-api:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
            { name: 'ConnectionStrings__thuddledb', secretRef: 'db-connection-string' }
            { name: 'ConnectionStrings__blobs', secretRef: 'storage-connection-string' }
            { name: 'Keycloak__AuthServerUrl', value: 'https://${keycloakCustomDomain != '' ? keycloakCustomDomain : keycloakApp.properties.configuration.ingress.fqdn}' }
            { name: 'Keycloak__Realm', value: 'Thuddle' }
            // CORS allowed origins — one indexed env var per origin in webAllowedOrigins
            { name: 'Cors__AllowedOrigins__0', value: webAllowedOrigins[0] }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 3
              periodSeconds: 5
              failureThreshold: 10
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/alive'
                port: 8080
              }
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// ─── Migrations Job ──────────────────────────────────────────────────────────

resource migrationsJob 'Microsoft.App/jobs@2024-03-01' = {
  name: 'thuddle-migrations'
  location: location
  properties: {
    environmentId: containerAppsEnv.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 1
      secrets: [
        {
          name: 'db-connection-string'
          value: 'Host=${postgresServer.properties.fullyQualifiedDomainName};Database=thuddledb;Username=${postgresAdminUser};Password=${postgresAdminPassword};SSL Mode=Require'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrations'
          image: '${containerRegistry}/thuddle-migrations:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'ConnectionStrings__thuddledb', secretRef: 'db-connection-string' }
          ]
        }
      ]
    }
  }
}

// ─── Static Web App ──────────────────────────────────────────────────────────

resource staticWebApp 'Microsoft.Web/staticSites@2024-04-01' = {
  name: 'thuddle-web'
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

output apiFqdn string = apiApp.properties.configuration.ingress.fqdn
output keycloakFqdn string = keycloakApp.properties.configuration.ingress.fqdn
output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output keycloakCustomDomain string = keycloakCustomDomain
output apiCustomDomain string = apiCustomDomain
