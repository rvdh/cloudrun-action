import * as core from '@actions/core'

export async function getEnvVarsFromImage(name: string): Promise<string[]> {
  const serviceAccountKey: string = core.getInput('service_account_key', {
    required: true
  })

  const imageUrl = new URL(`https://${name}`)

  const auth = {
    username: '_json_key',
    password: serviceAccountKey,
    auth: '',
    email: '',
    serveraddress: imageUrl.host
  }
  const authData = Buffer.from(JSON.stringify(auth)).toString('base64')

  const got = require('got')

  try {
    core.debug(`Sending pull image command for ${name}`)
    let response = await got.post(
      `unix:/var/run/docker.sock:/images/create?fromImage=${name}`,
      {
        headers: {'X-Registry-Auth': authData}
      }
    )

    // inspect the image
    response = await got(
      `unix:/var/run/docker.sock:/images/${name}/json`
    ).json()
    return response.ContainerConfig.Env
  } catch (error) {
    if (error.request) core.debug(JSON.stringify(error.request, null, 4))
    if (error.response) core.debug(JSON.stringify(error.response, null, 4))

    core.setFailed(error.response.body)
  }

  return []
}
