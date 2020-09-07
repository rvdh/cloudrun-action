import * as os from 'os'
import * as core from '@actions/core'
import * as fs from 'fs'

async function setGoogleApplicationCredentials(
  serviceAccountKey: string
): Promise<void> {
  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
    const uniqueFilename = require('unique-filename')

    const randomTmpFile = uniqueFilename(os.tmpdir())

    fs.writeFile(randomTmpFile, serviceAccountKey, function (
      err: Error | null
    ) {
      if (err) {
        core.debug(String(err))
      }
    })

    core.exportVariable('GOOGLE_APPLICATION_CREDENTIALS', randomTmpFile)
  }
}

export function getCloudRunEnvironmentVariables(): {
  name: string
  value: string
}[] {
  const entries = []
  for (const key in process.env) {
    if (key.startsWith('CLOUDRUN_ACTION_')) {
      const value = process.env[key]
      if (value !== undefined) {
        const entry = {
          name: key.replace('CLOUDRUN_ACTION_', ''),
          value
        }
        entries.push(entry)
      }
    }
  }

  const environment: {name: string; value: string}[] = entries

  return environment
}

function cloudRunCreateService(
  name: string,
  project: string,
  image: string,
  serviceAccountName: string,
  vpcConnectorName: string,
  envVars: {
    name: string
    value: string
  }[]
): {} {
  core.debug(JSON.stringify(envVars, null, 4))

  return {
    apiVersion: 'serving.knative.dev/v1',
    kind: 'Service',
    metadata: {
      name,
      namespace: project
    },
    spec: {
      template: {
        metadata: {
          annotations: {
            'run.googleapis.com/vpc-access-connector': vpcConnectorName
          }
        },
        spec: {
          serviceAccountName,
          containers: [
            {
              image,
              env: envVars
            }
          ]
        }
      }
    }
  }
}

async function delay(ms: number): Promise<void> {
  core.debug(`Sleeping for ${ms}ms`)
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function waitForDockerImage(
  image: string,
  serviceAccountKey: string
): Promise<boolean> {
  // Obtain user credentials to use for the request
  await setGoogleApplicationCredentials(serviceAccountKey)

  const {google} = require('googleapis')
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  })

  const authClient = await auth.getClient()
  google.options({auth: authClient})
  const project = await auth.getProjectId()

  const imageUrl = new URL(`https://${image}`)
  const imageName = imageUrl.pathname.substring(
    imageUrl.pathname.lastIndexOf('/') + 1,
    imageUrl.pathname.lastIndexOf(':')
  )
  const imageTag = imageUrl.pathname.substring(
    imageUrl.pathname.lastIndexOf(':') + 1
  )
  const url = `https://${imageUrl.host}/v2/${project}/${imageName}/manifests/${imageTag}`
  let attempt = 0
  const checkInterval = Number.parseInt(core.getInput('image_check_interval'))
  const maxAttempts =
    (Number.parseInt(core.getInput('image_check_timeout')) * 60) / checkInterval

  while (attempt < maxAttempts) {
    attempt++
    core.debug(`Waiting for docker image to appear, attempt ${attempt}...`)
    core.debug(`Requesting ${url}`)

    try {
      await auth.request({
        url,
        method: 'HEAD',
        headers: {Accept: '*/*'}
      })
      return true
    } catch (error) {
      if (error.response.status !== 404) {
        core.debug(`Unexpected error occurred`)
        throw error
      }
    }

    await delay(checkInterval * 1000)
  }
  return false
}

async function setCloudRunServiceIAMPolicy(
  name: string,
  project: string,
  runRegion: string
): Promise<void> {
  const {google} = require('googleapis')
  const run = google.run('v1')

  // Set IAM policy to allow unauthenticated access
  if (core.getInput('allow_unauthenticated')) {
    await run.projects.locations.services.setIamPolicy({
      resource: `projects/${project}/locations/${runRegion}/services/${name}`,
      requestBody: {
        policy: {
          bindings: [
            {
              members: ['allUsers'],
              role: 'roles/run.invoker'
            }
          ]
        }
      }
    })
  }
}

async function getCloudRunServiceURL(
  name: string,
  project: string,
  runRegion: string
): Promise<string> {
  const {google} = require('googleapis')
  const run = google.run('v1')

  // Wait until we get a url
  let attempt = 0
  while (attempt < 100) {
    attempt++
    core.debug(`Waiting for service to become ready, attempt ${attempt}...`)
    await delay(500)
    const res = await run.namespaces.services.get(
      {
        name: `namespaces/${project}/services/${name}`
      },
      {
        rootUrl: `https://${runRegion}-run.googleapis.com`
      }
    )
    if (res.data.status.conditions[0].status !== 'Unknown') {
      if (res.data.status.url) {
        core.setOutput('url', res.data.status.url)
        return res.data.status.url
      } else {
        throw new Error(
          `${res.data.status.conditions[0].message}\nView logs for this revision: https://console.cloud.google.com/run/detail/${runRegion}/${name}/logs?project=${project}`
        )
      }
    }
  }
  throw new Error(
    'Unable to retrieve service URL! Check the Cloud Run deployment for errors.'
  )
}

export async function createOrUpdateCloudRunService(
  name: string,
  runRegion: string,
  image: string,
  serviceAccountName: string,
  serviceAccountKey: string,
  vpcConnectorName: string,
  envVars: {
    name: string
    value: string
  }[]
): Promise<{url: string; logsUrl: string}> {
  try {
    const {google} = require('googleapis')
    const run = google.run('v1')

    await setGoogleApplicationCredentials(serviceAccountKey)
    // Obtain user credentials to use for the request
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })

    const authClient = await auth.getClient()
    google.options({auth: authClient})
    const project = await auth.getProjectId()

    const serviceName = name.replace(/_/g, '-')

    core.debug(
      `Checking if service ${serviceName} exists (name: namespaces/${project}/services/${serviceName})..`
    )
    try {
      await run.namespaces.services.get(
        {
          name: `namespaces/${project}/services/${serviceName}`
        },
        {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      )
      core.debug(`Updating service ${serviceName}.`)
      const response = await run.namespaces.services.replaceService(
        {
          name: `namespaces/${project}/services/${serviceName}`,
          requestBody: cloudRunCreateService(
            serviceName,
            project,
            image,
            serviceAccountName,
            vpcConnectorName,
            envVars
          )
        },
        {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      )
      core.debug(JSON.stringify(response, null, 4))

      core.debug(`Service ${serviceName} updated`)
    } catch (error) {
      core.debug(JSON.stringify(error, null, 4))
      if (error.code === 404) {
        core.debug(`Creating service ${serviceName}`)
        try {
          await run.namespaces.services.create(
            {
              parent: `namespaces/${project}`,
              requestBody: cloudRunCreateService(
                serviceName,
                project,
                image,
                serviceAccountName,
                vpcConnectorName,
                envVars
              )
            },
            {
              rootUrl: `https://${runRegion}-run.googleapis.com`
            }
          )
          core.debug(`Service ${serviceName} created`)
        } catch (crError) {
          core.debug(JSON.stringify(crError.request, null, 4))
          core.debug(JSON.stringify(crError.response, null, 4))
        }
      }
    }

    await setCloudRunServiceIAMPolicy(serviceName, project, runRegion)
    const url = await getCloudRunServiceURL(serviceName, project, runRegion)
    return {
      url,
      logsUrl: `https://console.cloud.google.com/run/detail/${runRegion}/${serviceName}/logs?project=${project}`
    }
  } catch (error) {
    core.setFailed(error.message)
    throw error
  }
}

export async function deleteCloudRunService(
  name: string,
  runRegion: string,
  serviceAccountKey: string
): Promise<void> {
  try {
    const {google} = require('googleapis')
    const run = google.run('v1')
    const serviceName = name.replace(/_/g, '-')
    await setGoogleApplicationCredentials(serviceAccountKey)
    // Obtain user credentials to use for the request
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })

    const authClient = await auth.getClient()
    google.options({auth: authClient})
    const project = await auth.getProjectId()

    core.debug(
      `Checking if service ${serviceName} exists (name: namespaces/${project}/services/${serviceName})..`
    )
    try {
      await run.namespaces.services.delete(
        {
          name: `namespaces/${project}/services/${serviceName}`
        },
        {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      )
      core.info(`Service ${serviceName} deleted`)
    } catch (error) {
      if (error.code === 404) {
        core.info(`Service ${serviceName} does not exist, unable to delete`)
        return
      }
      throw error
    }
  } catch (error) {
    core.setFailed(error.message)
    throw error
  }
}
