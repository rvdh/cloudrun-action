import * as os from 'os'
import * as core from '@actions/core'
import * as fs from 'fs'

function setGoogleApplicationCredentials(serviceAccountKey: string): void {
  // See if we already saved it to a file
  let randomTmpFile = core.getState('randomTmpFile')
  if (!randomTmpFile) {
    const uniqueFilename = require('unique-filename')

    randomTmpFile = uniqueFilename(os.tmpdir())

    fs.writeFile(randomTmpFile, serviceAccountKey, function (
      err: Error | null
    ) {
      if (err) {
        core.debug(String(err))
      }
    })
    core.saveState('randomTmpFile', randomTmpFile)
  }
  core.exportVariable('GOOGLE_APPLICATION_CREDENTIALS', randomTmpFile)
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
  setGoogleApplicationCredentials(serviceAccountKey)

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
      const res = await auth.request({
        url: `https://${imageUrl.host}/v2/${project}/${imageName}/manifests/${imageTag}`,
        method: 'HEAD'
      })
      core.info(`res = ${res}`)
      core.debug(JSON.stringify(res, null, 4))
      return true
    } catch (error) {
      core.info(error.message)
    }

    await delay(500)
  }
  return false
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

    setGoogleApplicationCredentials(serviceAccountKey)
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
      const existsRes = await run.namespaces.services.get(
        {
          name: `namespaces/${project}/services/${name}`
        },
        {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      )
      if (existsRes) {
        const requestBody = cloudRunCreateService(
          name,
          project,
          image,
          serviceAccountName,
          vpcConnectorName
        )
        core.debug(`Updating service ${name}.`)
        const res = await run.namespaces.services.replaceService(
          {
            name: `namespaces/${project}/services/${name}`,
            requestBody
          },
          {
            rootUrl: `https://${runRegion}-run.googleapis.com`
          }
        )
        core.debug(`Service ${name} updated`)
        core.setOutput('url', res.data.status.url)
        return res.data.status.url
      }
    } catch (error) {
      const requestBody = cloudRunCreateService(
        name,
        project,
        image,
        serviceAccountName,
        vpcConnectorName
      )
      core.debug(`Creating service ${name}`)

      let res = await run.namespaces.services.create(
        {
          parent: `namespaces/${project}`,
          requestBody
        },
        {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      )
      core.debug(`Service ${name} created`)

      // Wait until we get a url
      let attempt = 0
      while (!res.data.status.url && attempt < 100) {
        attempt++
        core.debug(`Waiting for service to become ready, attempt ${attempt}...`)
        await delay(500)
        res = await run.namespaces.services.get(
          {
            name: `namespaces/${project}/services/${name}`
          },
          {
            rootUrl: `https://${runRegion}-run.googleapis.com`
          }
        )
      }
      if (!res.data.status.url) {
        core.info(
          'Unable to retrieve service URL! Check the Cloud Run deployment for errors.'
        )
      }
      core.setOutput('url', res.data.status.url)
      return res.data.status.url
    }
  } catch (error) {
    core.setFailed(error.message)
  }
  return ''
}
