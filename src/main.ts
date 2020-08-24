import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    const image: string = core.getInput('image')
    const name: string = core.getInput('name')
    const serviceAccountName: string = core.getInput('serviceAccountName')
    const vpcConnectorName: string = core.getInput('vpcConnectorName')
    core.debug(`Deploying docker image ${image}...`)

    const {google} = require('googleapis')
    const run = google.run('v1')

    // Obtain user credentials to use for the request
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })

    const authClient = await auth.getClient()
    google.options({auth: authClient})

    const projectId = await google.auth.getProjectId()

    const res = await run.namespaces.services.create({
      requestBody: {
        metadata: {
          name: name
        },
        spec: {
          template: {
            spec: {
              serviceAccountName: serviceAccountName,
              annotations: {
                'run.googleapis.com/vpc-access-connector': vpcConnectorName
              },

              containers: [
                {
                  image: image,
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

    console.log(res.data)

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

run()
