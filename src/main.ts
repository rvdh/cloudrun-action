import * as core from '@actions/core'

async function main(): Promise<void> {
  try {
    const image: string = core.getInput('image')
    const name: string = core.getInput('name')
    const serviceAccountName: string = core.getInput('service_account_name')
    const vpcConnectorName: string = core.getInput('vpc_connector_name')

    core.info(`Deploying docker image ${image}...`)
    const {google} = require('googleapis')
    const run = google.run('v1')

    // Obtain user credentials to use for the request
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })

    const authClient = await auth.getClient()
    google.options({auth: authClient})

    //const projectId = await google.auth.getProjectId()

    const res = await run.namespaces.services.create({
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
                  env: [
                    {
                      name: 'ENV_NAME',
                      value: 'cloudrun'
                    }
                  ]
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
