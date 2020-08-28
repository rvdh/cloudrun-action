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
    core.debug('Set credentials')
    core.debug(`GAC is now ${process.env['GOOGLE_APPLICATION_CREDENTIALS']}`)
  } else {
    core.debug(`GAC = ${process.env['GOOGLE_APPLICATION_CREDENTIALS']}`)
  }
}

function getCloudRunEnvironmentVariables(): {}[] {
  const environment = []
  for (const key in process.env) {
    if (key.startsWith('CLOUDRUN_ACTION_')) {
      const value = process.env[key]
      const entry = {
        name: key.replace('CLOUDRUN_ACTION_', ''),
        value
      }
      environment.push(entry)
    }
  }
  return environment
}

function cloudRunCreateService(
  name: string,
  project: string,
  image: string,
  serviceAccountName: string,
  vpcConnectorName: string
): {} {
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
              env: getCloudRunEnvironmentVariables()
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
  while (attempt < 100) {
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

    await delay(5000)
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
    run.projects.locations.services.setIamPolicy({
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
    try {
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
          core.debug(JSON.stringify(res, null, 4))
          throw new Error(res.data.status.conditions[0].message)
        }
      }
    } catch (error) {
      core.debug(JSON.stringify(error, null, 4))
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
  vpcConnectorName: string
): Promise<string> {
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

    core.debug(
      `Checking if service ${name} exists (name: namespaces/${project}/services/${name})..`
    )
    try {
      await run.namespaces.services.get(
        {
          name: `namespaces/${project}/services/${name}`
        },
        {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      )
      core.debug(`Updating service ${name}.`)
      await run.namespaces.services.replaceService(
        {
          name: `namespaces/${project}/services/${name}`,
          requestBody: cloudRunCreateService(
            name,
            project,
            image,
            serviceAccountName,
            vpcConnectorName
          )
        },
        {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      )
      core.debug(`Service ${name} updated`)
    } catch (error) {
      core.debug(JSON.stringify(error, null, 4))
      if (error.code === 404) {
        core.debug(`Creating service ${name}`)
        await run.namespaces.services.create(
          {
            parent: `namespaces/${project}`,
            requestBody: cloudRunCreateService(
              name,
              project,
              image,
              serviceAccountName,
              vpcConnectorName
            )
          },
          {
            rootUrl: `https://${runRegion}-run.googleapis.com`
          }
        )
        core.debug(`Service ${name} created`)
      }
    }

    await setCloudRunServiceIAMPolicy(name, project, runRegion)
    return await getCloudRunServiceURL(name, project, runRegion)
  } catch (error) {
    core.setFailed(error.message)
    throw error
  }
}
