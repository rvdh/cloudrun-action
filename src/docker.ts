import * as core from '@actions/core'

export async function getEnvVarsFromImage(
  name: string
): Promise<string[] | undefined> {
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
    await got.post(`unix:/var/run/docker.sock:/images/create?fromSrc=${name}`, {
      headers: {'X-Registry-Auth': authData}
    })

    // inspect the image
    const response = await got(`unix:/var/run/docker.sock:/images/${name}/json`)
    core.debug(JSON.stringify(response, null, 4))
    return response.body.ContainerConfig.Env
  } catch (error) {
    core.setFailed(error.response.body)
  }

  return undefined
}
