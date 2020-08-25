import * as os from 'os'
import * as core from '@actions/core'
import * as fs from 'fs'

function setGoogleApplicationCredentials(serviceAccountKey: string): void {
  const uniqueFilename = require('unique-filename')

  const randomTmpFile = uniqueFilename(os.tmpdir())

  fs.writeFile(randomTmpFile, serviceAccountKey, function (err: Error | null) {
    if (err) {
      core.debug(String(err))
    }
  })

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

async function main(): Promise<void> {
  try {
    const image: string = core.getInput('image')
    const name: string = core.getInput('name')
    const serviceAccountName: string = core.getInput('service_account_name')
    const serviceAccountKey: string = core.getInput('service_account_key')
    const vpcConnectorName: string = core.getInput('vpc_connector_name')
    core.info(`service_account_key set to {serviceAccountKey}`)
    setGoogleApplicationCredentials(serviceAccountKey)

    core.info(`Deploying docker image ${image}...`)
    core.info(
      `GOOGLE_APPLICATION_CREDENTIALS set to ${process.env['GOOGLE_APPLICATION_CREDENTIALS']}`
    )
    const {google} = require('googleapis')
    const run = google.run('v1')

    // Obtain user credentials to use for the request
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })

    const authClient = await auth.getClient()
    google.options({auth: authClient})

    const res = await run.namespaces.services.create({
      parent: auth.getProjectId(),
      requestBody: {
        metadata: {
          name
        },
        spec: {
          template: {
            spec: {
              serviceAccountName,
              annotations: {
                'run.googleapis.com/vpc-access-connector': vpcConnectorName
              },

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
    })

    core.info(res.data)

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
