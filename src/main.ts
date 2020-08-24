import * as core from '@actions/core'
import * as gcloud from './gcloud'
import * as github from './github'

async function main(): Promise<void> {
  try {
    const name: string = core.getInput('name')
    const serviceAccountKey: string = core.getInput('service_account_key')
    const runRegion: string = core.getInput('run_region')
    const image: string = core.getInput('image')
    const serviceAccountName: string = core.getInput('service_account_name')
    const vpcConnectorName: string = core.getInput('vpc_connector_name')

    core.info(`Deploying docker image ${image}...`)

    // add github comment
    await github.addCommentToPullRequest(`🤖 Cloud Run Deployment: Starting`)

    // update comment (checking for image)
    // wait for image

    await gcloud.createOrUpdateCloudRunService(
      name,
      runRegion,
      image,
      serviceAccountName,
      serviceAccountKey,
      vpcConnectorName
    )

    // timed out
    // update comment
    // gcloud run deploy
    // update comment
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
