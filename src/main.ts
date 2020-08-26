import * as os from 'os'
import * as core from '@actions/core'
import * as fs from 'fs'

function setGoogleApplicationCredentials(serviceAccountKey: string): string {
  const uniqueFilename = require('unique-filename')

  const randomTmpFile = uniqueFilename(os.tmpdir())

  fs.writeFile(randomTmpFile, serviceAccountKey, function (err: Error | null) {
    if (err) {
      core.debug(String(err))
    }
  })

  return randomTmpFile
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
  image: string
): {} {
  const serviceAccountName: string = core.getInput('service_account_name')
  const vpcConnectorName: string = core.getInput('vpc_connector_name')

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

async function main(): Promise<void> {
  try {
    const name: string = core.getInput('name')
    const serviceAccountKey: string = core.getInput('service_account_key')
    const runRegion: string = core.getInput('run_region')
    const image: string = core.getInput('image')

    core.info(`Deploying docker image ${image}...`)
    const {google} = require('googleapis')
    const run = google.run('v1')

    const keyFile = setGoogleApplicationCredentials(serviceAccountKey)
    // Obtain user credentials to use for the request
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })

    const authClient = await auth.getClient()
    google.options({auth: authClient})
    const project = await auth.getProjectId()

    core.info(`Checking if service ${name} exists..`)
    const existsRes = await run.namespaces.services.get({
      name: `namespaces/${project}/services/${name}`
    })
    if (existsRes) {
      const requestBody = cloudRunCreateService(name, project, image)
      core.info(
        `Service ${name} already exists, replacing service (body: ${requestBody})`
      )
      await run.namespaces.services.replaceService({
        name: `namespaces/${project}/services/${name}`,
        requestBody,
        options: {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      })
    } else {
      const requestBody = cloudRunCreateService(name, project, image)
      core.info(
        `Service ${name} does not exist, creating service (body: ${requestBody})`
      )

      await run.namespaces.services.create({
        parent: `namespaces/${project}`,
        requestBody,
        options: {
          rootUrl: `https://${runRegion}-run.googleapis.com`
        }
      })
    }
    // add github comment
    // update comment (checking for image)
    // wait for image
    // timed out
    // update comment
    // gcloud run deploy
    // update comment

    //core.setOutput('url', new Date().toTimeString())
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
