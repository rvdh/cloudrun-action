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
    let comment = `🤖  Cloud Run Deployment: Starting\n`
    const comment_id = await github.addPullRequestComment(comment)

    // update comment (checking for image)
    comment += `🤖  Cloud Run Deployment: waiting for docker image ${image} to be available on Google Container Registry.\n`
    // wait for image
    github.updatePullRequestComment(comment_id, comment)

    if (!gcloud.waitForDockerImage(image, serviceAccountKey)) {
      comment += `🤖  Cloud Run Deployment: Docker image not found, stopping.\n`
      github.updatePullRequestComment(comment_id, comment)
      core.setFailed('Docker image not found, stopping.')
      return
    }

    comment += `🤖  Cloud Run Deployment: Docker image found, starting deployment.\n`
    github.updatePullRequestComment(comment_id, comment)

    const url = gcloud.createOrUpdateCloudRunService(
      name,
      runRegion,
      image,
      serviceAccountName,
      serviceAccountKey,
      vpcConnectorName
    )
    comment += `🤖  Cloud Run Deployment: Deployment succesful, url: ${url}.\n`
    github.updatePullRequestComment(comment_id, comment)
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
